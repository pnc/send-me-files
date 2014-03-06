class UploadsController < ApplicationController
  def new
    @allowed = if Rails.application.config.password
                 params[:a] == Rails.application.config.password
               else
                 true
               end
  end

  def create
    upload = Upload.new(params)
    upload.save!
    respond_to do |format|
      format.json { render json: {message: upload.confirmation_message} }
    end
  end
end
