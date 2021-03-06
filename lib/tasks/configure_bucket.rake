namespace :deployment do
  desc "Create uploads bucket named S3_BUCKET"
  task :configure_bucket => :environment do
    name = ENV["S3_BUCKET"]
    s3 = AWS::S3.new
    bucket = s3.buckets[name]
    raise "Bucket #{name} does not exist" unless bucket.exists?

    hostname = SendMeFiles::Application.config.hostname
    rule = AWS::S3::CORSRule.new(id: "upload-rule",
                                 allowed_methods: %w(GET POST PUT),
                                 allowed_origins: ["http://#{hostname}", "https://#{hostname}"],
                                 allowed_headers: ["*"])
    bucket.cors.add(rule)
  end
end
