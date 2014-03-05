class UploadsController < ApplicationController
  def new
    @allowed = params[:a] == "kj3KFO9eEOKFjwwoe"
  end

  def create
    upload = Upload.new(params)
    upload.save!
    respond_to do |format|
      format.json { render json: {message: upload.confirmation_message} }
    end
  end
end
