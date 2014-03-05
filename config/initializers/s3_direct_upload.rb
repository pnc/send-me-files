S3DirectUpload.config do |c|
  c.access_key_id = ENV["AWS_KEY"] || raise("Missing AWS_KEY")
  c.secret_access_key = ENV["AWS_SECRET"] || raise("Missing AWS_SECRET")
  c.bucket = Rails.application.config.s3_bucket
end
