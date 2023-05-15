import { S3Client } from "@aws-sdk/client-s3";
import { Credentials } from "@aws-sdk/types";
import { FetchHttpHandler, FetchHttpHandlerOptions } from "@aws-sdk/fetch-http-handler";
import { HttpHandler, HttpRequest, HttpResponse } from "@aws-sdk/protocol-http";
import { Upload as ManagedUpload, RawDataPart } from "@aws-sdk/lib-storage";

import React from "react";
import ReactDOM from "react-dom";
import prettyBytes from "pretty-bytes";
import { v4 as uuidv4 } from 'uuid';

import addFileIcon from "url:./images/add-file.svg";
import cancelIcon from "url:./images/cancel.svg";
import checkmarkIcon from "url:./images/checkmark.svg";

/**
 * Although the S3Client class has parameters for configuring a custom
 * S3 endpoint, these cause the signature to be computed for that endpoint,
 * not the aliased one. We want the signature to be as the normal bucket endpoint
 * at your-storagebucket-quux.s3.us-east-1.amazonaws.com expects, but routed via
 * our custom hostname.
 *
 * This class does that by changing the hostname of the request just before it's
 * sent, but after the other AWS SDK middlewares have modified it (see
 * bucketEndpointMiddleware in particular.)
 */
class CDNHostFetchHttpHandler extends FetchHttpHandler {
  readonly cdnHost: string;
  constructor(cdnHost: string, options: FetchHttpHandlerOptions | undefined) {
    super(options);
    this.cdnHost = cdnHost;
  }

  handle(request: HttpRequest, options): Promise<{ response: HttpResponse }> {
    request.hostname = this.cdnHost;
    return super.handle(request, options);
  }
}

/**
 * Function for reporting errors to the server. This is very low-tech:
 * errors are encoded in the GET path, logged (as 404s), but can still
 * be parsed and analyzed from the logs using e.g. AWS Athena.
 * @param event The error to report, usually a JS error.
 */
const reportError = function (event) {
  let info = {
    msg: event.message,
    f: event.filename,
    l: event.lineno,
    c: event.colno,
    e: event.error,
    ua: window.navigator.userAgent,
    p: window.navigator.platform,
    st: undefined
  };
  if (event.error) {
    info.st = event.error.stack;
  }
  let json = JSON.stringify(info);
  fetch(`/errors/${json.substring(0, 3992)}`).catch(function (reason) {
    console.error("Unable to report error: ", reason, info);
  });
};

window.addEventListener("error", reportError);
window.addEventListener("unhandledrejection", (e) => {
  reportError({ message: `unhandledrejection: ${e.reason}` });
});

enum UploadStatus {
  WaitingForAuthentication,
  Uploading,
  Succeeded,
  Aborted,
  Failed
}

interface Upload {
  id: string;
  filename: string;
  progress: number;
  barProgress: number;
  size: number;
  status: UploadStatus;
  cancelHandler: () => void;
}

type UploadAuthorization = {
  credentials: Credentials;
  bucket: string;
  prefix: string;
}

type CredentialsState =
| { status: "initial"; }
| { status: "authenticated"; uploadAuthorization: UploadAuthorization; }
| { status: "authentication_failed"; retryTimer: string };

class CredentialsManager {
  readonly maxRetries = 10;
  readonly credentialsPath = "/credentials";

  sessionName: string;
  state: CredentialsState;
  protected uploadAuthorizationPromise?: Promise<UploadAuthorization>;

  constructor() {
    this.state = { status: "initial" };
    this.sessionName = uuidv4();
  }

  async getUploadAuthorization() {
    if (!this.uploadAuthorizationPromise) {
      this.uploadAuthorizationPromise = this.fetchUploadAuthorization();
    }
    return this.uploadAuthorizationPromise;
  }

  clearUploadAuthorization() {
    this.uploadAuthorizationPromise = undefined;
  }

  private async fetchUploadAuthorization(): Promise<UploadAuthorization> {
    let response;
    for (let i = 1; i < this.maxRetries; i++) {
      try {
        response = await fetch(this.credentialsPath, {
          method: "POST",
          body: JSON.stringify({sessionName: this.sessionName})
        });
        let body = await response.json();
        if (response.ok) {
          const uploadAuthorization: UploadAuthorization = {
            credentials: {
              accessKeyId: body.credentials.AccessKeyId,
              secretAccessKey: body.credentials.SecretAccessKey,
              sessionToken: body.credentials.SessionToken,
              expiration: new Date(body.credentials.Expiration)
            },
            bucket: body.bucket,
            prefix: body.prefix
          };
          this.state = {status: "authenticated", uploadAuthorization};
          return uploadAuthorization;
        } else {
          throw new Error(`Unable to fetch upload authorization, ${response.status} ${response.statusText} ${response}`);
        }
      } catch (error) {
        console.error(`Attempt ${i}: Unable to fetch credentials`, response.statusText, response.status, response);
      }
      await this.sleep(Math.min(45000, Math.pow(2, i + 8)));
    }
    // Retries exceeded: give up, but do allow manual retry by
    // clearing the (rejected) cached promise.
    this.uploadAuthorizationPromise = undefined;
    throw new Error(`Unable to fetch credentials, ${this.maxRetries} retries exceeded: HTTP ${response.status}`);
  }

  private sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

type StateChangedCallback = () => void;

class SlicedUpload extends ManagedUpload {
  private file: File
  private feeder?: AsyncGenerator<RawDataPart, void, undefined> = undefined

  constructor(file, options) {
    super(options);
    this.file = file;
  }

  async* sliceGenerator() {
    var slice;
    var offset = 0;
    const sliceSize = 1024 * 1024 * 5;
    var partNumber = 1;
    while ((slice = this.file.slice(offset, offset + sliceSize)) && slice.size > 0) {
      offset += sliceSize;
      yield {data: slice, partNumber, lastPart: offset >= this.file.size};
      partNumber++;
    }
  }

  async __doConcurrentUpload(dataFeeder: AsyncGenerator<RawDataPart, void, undefined>): Promise<void> {
    // The built-in implementation tries to use .stream().getReader().read(), which fails with an I/O
    // error for large files in Safari. Since we're uploading multipart anyway, use the
    // File.prototype.slice function to explicitly read a chunk at a time.
    if (!this.feeder) {
      this.feeder = this.sliceGenerator();
    }
    return super.__doConcurrentUpload(this.feeder);
  }
}

class UploadManager {
  // Use x% of the progress bar for the credentials fetch.
  readonly reservedPercent = 4;

  uploads: Upload[] = [];
  credentialsManager: CredentialsManager;
  cachedUploadAuthorization?: UploadAuthorization;
  s3Client?: S3Client;
  stateChanged: StateChangedCallback;

  constructor(credentialsManager: CredentialsManager, stateChangedCallback: StateChangedCallback) {
    this.credentialsManager = credentialsManager;
    this.stateChanged = stateChangedCallback;
  }

  async startUpload(file: File) {
    var upload: Upload = {
      status: UploadStatus.WaitingForAuthentication,
      id: uuidv4(),
      progress: 0,
      barProgress: 0,
      filename: file.name,
      size: file.size,
      cancelHandler: () => true
    };
    this.uploads.push(upload);

    this.stateChanged();
    const intervalHandle = setInterval(() => {
      upload.barProgress += (this.reservedPercent - upload.barProgress) * 0.05;
      this.stateChanged();
    }, 50);

    try {
      if (!this.cachedUploadAuthorization) {
        this.cachedUploadAuthorization = await this.credentialsManager.getUploadAuthorization();
      }

      if (!this.s3Client) {
        let host = document.location.host;
        // During development and test, this is overridden to allow direct, non-proxied
        // access to S3.
        if (process.env.S3_BUCKET_ENDPOINT && process.env.NODE_ENV !== 'production') {
          host = process.env.S3_BUCKET_ENDPOINT;
        }
        this.s3Client = new S3Client({
          region: "us-east-1",
          requestHandler: new CDNHostFetchHttpHandler(host, undefined),
          credentials: async () => {
            const uploadAuthorization = await this.credentialsManager.getUploadAuthorization();
            this.credentialsManager.clearUploadAuthorization();
            return uploadAuthorization.credentials;
        }})
      }

      clearInterval(intervalHandle);
      this.stateChanged();

      let up = new SlicedUpload(file, {
        client: this.s3Client,
        params: {
          Bucket: this.cachedUploadAuthorization.bucket,
          Key: this.cachedUploadAuthorization.prefix + upload.filename,
          Body: file
        }
      });
      upload.cancelHandler = () => {
        up.abort();
        upload.status = UploadStatus.Aborted;
        this.stateChanged();
      }
      up.on('httpUploadProgress', (evt) => {
        console.log(evt);
        let pct = ((evt.loaded ?? 0) * (100 - this.reservedPercent)) / (evt.total ?? 100) + this.reservedPercent;
        upload.barProgress = pct;
        upload.progress = (evt.loaded ?? 0) * 100 / (evt.total ?? 100);
        this.stateChanged();
      });
      upload.status = UploadStatus.Uploading;
      this.stateChanged();

      await up.done();
      upload.status = UploadStatus.Succeeded;
      this.stateChanged();
    } catch (error) {
      clearInterval(intervalHandle);
      if (error.name == "AbortError") {
        upload.status = UploadStatus.Aborted;
      } else {
        upload.status = UploadStatus.Failed;
      }

      this.stateChanged();
      throw error;
    }
  }
}

const credentialsManager = new CredentialsManager();
const uploadManager = new UploadManager(credentialsManager, () => {
  globalRender();
});

let dragging = false;

function promptMessage() {
  if (dragging) {
    return <p>Drop anywhere to send this file to me.</p>;
  } else {
   return <p>Select or drag and drop files above to send them to me.</p>;
  }
}

function globalRender() {
  let root = document.getElementById("root");
  const renderProgress = function(entry) {
    switch (entry.status) {
      case UploadStatus.Aborted:
        return <div className="card-subtitle">Upload canceled.</div>;
      case UploadStatus.Failed:
        return <div className="card-subtitle">Upload failed.</div>;
      default:
        return <div className="card-progress-bar"><div className="card-progress-complete" style={{width: `${entry.barProgress}%`}}></div></div>;
    }
  }
  const uploadEntries = uploadManager.uploads.map(entry => {
    if (entry.status == UploadStatus.Succeeded) {
      return <div key={entry.id} className="card card-file">
        <div className="card-lead"><img src={checkmarkIcon} alt="checkmark"/></div>
        <div className="card-title">{entry.filename}</div>
        <div className="card-subtitle">Sent successfully. I have your file!</div>
      </div>
    } else {
      return <div key={entry.id} className="card card-file">
        <div className="card-lead">{Math.round(entry.progress)}%</div>
        {(entry.status == UploadStatus.Uploading || entry.status == UploadStatus.WaitingForAuthentication) && <div className="card-follow">{prettyBytes(entry.size)}</div>}
        <div className="card-title">{entry.filename}</div>
        {renderProgress(entry)}
        {entry.status == UploadStatus.Uploading && <button className="card-cancel" onClick={entry.cancelHandler}><img src={cancelIcon} alt="Cancel Upload"/></button>}
      </div>
    }
  });
  ReactDOM.render(<div>
          <label className="card"><img src={addFileIcon} alt="add file"/><input id="lode" type="file" multiple="multiple" onChange={onFileChange}/></label>
          {promptMessage()}
          {uploadEntries}
          </div>,
          root);
}

function onFileChange(event, a) {
  let input = event.currentTarget;
  let files: FileList = input.files;

  for (var i = 0; i < files.length; i++) {
    let file = files[i];
    uploadManager.startUpload(file);
    console.log("upload started", file);
  };
  // Reset the file input so it's ready for another file
  input.value = "";
}

// https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop

document.body.addEventListener("dragover", (event) => {
  document.body.classList.add("dragging");
  dragging = true;
  globalRender();
  event.dataTransfer.dropEffect = "copy";
  event.preventDefault();
});

document.body.addEventListener("drop", (event) => {
  event.preventDefault();
  document.body.classList.remove("dragging");
  dragging = false;
  globalRender();
  debugger;
  // Probably need to do a thing in Safari
  // https://github.com/aws/aws-sdk-js-v3/blob/main/lib/lib-storage/example-code/upload-unknown-length-browser.ts
  if (event.dataTransfer?.items) {
    // Use DataTransferItemList interface to access the file(s)
    for (var i = 0; i < event.dataTransfer.items.length; i++) {
      // If dropped items aren't files, reject them
      let item = event.dataTransfer.items[i];
      if (item.kind === 'file') {
        let file = item.getAsFile();
        if (file) {
          uploadManager.startUpload(file);
        } else {
          reportError(new Error(`Rejected dropped item, kind 'file' but getAsFile returned null: ${item.toString()}`));
        }
      } else {
        reportError(new Error(`Rejected a dropped item of kind ${item.kind}.`));
      }
    }
  } else if (event.dataTransfer?.files) {
    // Use DataTransfer interface to access the file(s)
    for (var i = 0; i < event.dataTransfer.files.length; i++) {
      let file = event.dataTransfer.files[i];
      uploadManager.startUpload(file);
    }
  } else {
    throw new Error(`A file was dropped, but didn't have the expected dataTranfer types: ${event.toString()}`);
  }
});

document.body.addEventListener("dragleave", (event) => {
  document.body.classList.remove("dragging");
  dragging = false;
  globalRender();
});

globalRender();
