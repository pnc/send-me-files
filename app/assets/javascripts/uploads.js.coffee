# Place all the behaviors and hooks related to the matching controller here.
# All this logic will automatically be available in application.js.
# You can use CoffeeScript in this file: http://coffeescript.org/

jQuery ->
  if !Modernizr.input['multiple']
    $("#multiple").hide()

  $("#uploader").S3Uploader
    remove_completed_progress_bar: false

  $("#uploader").bind "ajax:success", (e, data) ->
    console.log("Got this back: ", data)
    $("#content").append($("<p>").addClass("message").text(data.message));

  $("#uploader").bind "ajax:error", (e, data) ->
    $("#content").append($("<p>").addClass("message").text("Your file couldn't be sent. Maybe try again?"));
