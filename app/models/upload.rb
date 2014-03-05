class Upload
  def initialize(params)
    puts "Got params: #{params}"
    @url = params[:url]
    @filename = params[:filename]
  end

  def save!
    sns = AWS::SNS.new
    topic = sns.topics[Rails.application.config.sns_topic]
    topic.publish("You have a new file named #{@filename}. \n\n"\
                  "Download your file here: #{@url}",
                  subject: "New file: #{@filename}")
  end

  def confirmation_message
    "Your file #{@filename} has been sent!"
  end
end
