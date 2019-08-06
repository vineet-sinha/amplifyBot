# AmplifyBot

This is a Slack bot that monitors for posts in a channel and will tweet them from a channel. This bot was created by [Vineet Sinh](https://github.com/vineet-sinha). Each user get's one tweet per day.

## User Usage
Create a tweet starting with the twitter emoji and type your message for example:
    `:twitter: Hey friends, checkout Vineet's new project! http://twitter.com/some/post`

## Configuration 

#### Environment Variables

```
// Slack
SLACK_BOT_TOKEN - Bot User OAuth Access Token
SLACK_SIGNING_SECRET - The App Signing Secret

// Twitter
TWITTER_CONSUMER_KEY
TWITTER_CONSUMER_SECRET
TWITTER_ACCESS_TOKEN_KEY
TWITTER_ACCESS_TOKEN_SECRET
```

#### Slack

You will need to create an app for development purposes to test with. It's best to create your own slack workspace for testing.

> Note: Slack needs a callback URL, if you're developing locally you will need to use ngrok (or another nat traversal system) to expose your local server to the internet.

- Add a bot user to your app
- Enable Event Subscriptions for your app
  - Type in your ngrok address with `/slack/events` on the end (eg. https://ffs3423.ngrok.io/slack/events)
  - Add the following event subsriptions to "Bot Events"
    - message.channels
    - message.groups
    - message.im
    - message.mpim
- Save Changes
- Head back to "Basic Information" and reinstall your app under the "Install your app to your workspace" dropdown

#### Usage

With the above environment variables set, start the node project as `node index.js`.
