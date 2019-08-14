const { App } = require('@slack/bolt');
const twitter = require('twitter');

var twitterClient = new twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
});

// Pipeline methods
// All receive params:{context, body, payload, event, message, say, next}
// And need to return params if the pipeline is to continue

const filterChannelJoins = function(params) {
  if (params.message.subtype && params.message.subtype === 'channel_join') return;
  return params;
}

var postCache = {}; // TODO: ideally move to a db
const checkUserPostLimits = function(validDelay) {
  let checkSpecifiedUserPostLimits = function(params) {
    let userId = params.message.user;
    let now = new Date();
    let lastPost = postCache[userId] && postCache[userId].lastPostTime;
    if (lastPost) {
      if (now - lastPost < validDelay) return;
    }
    return params;
  }
  return checkSpecifiedUserPostLimits;
}

const printDbg = function(params) {
  console.log('Debug - message:', params.message);
  return params;
}

const notifyOfQueuedTweet = function(params) {
  let msgToTweet = params.message.text;
  msgToTweet = msgToTweet.replace(/:twitter:/,'')

  params.say(`Hey there <@${params.message.user}>! - Your tweet has been queued, please say "yes" to tweet. Your tweet is: ${msgToTweet}`);

  return params;
}

const notifyOfTweet = function(params) {
  let msgToTweet = params.message.text;
  msgToTweet = msgToTweet.replace(/:twitter:/,'')

  params.say(`Hey there <@${params.message.user}>! - Your tweet is being sent! Your tweet is: ${msgToTweet}`);

  return params;
}

// QueueTweetWithExpiry will add the tweet and content to a cache which expires after a finite amount of time (default 15 minutes). 
const queueTweetWithExpiry = function(expiryInMinutes = 15) {
  let queueTweet = function(params) {
    let msgToTweet = params.message.text;
    msgToTweet = msgToTweet.replace(/:twitter:/,'')
    let userId = params.message.user;
    postCache[userId] = {
      "content": msgToTweet,
      "lastPostTime": new Date(),
      "expiry": new Date(new Date().getTime() + expiryInMinutes*60000)
    }
    return params;
  };

  return queueTweet;
}

const checkTweetExpiry = function(params) {
  let now = new Date();
  let postExpiry = postCache[userId] && postCache[userId].expiry;
    if (postExpiry) {
      if (now > postExpiry) return;
    }

    return params;
}

// NOTE: this function returns immediately (i.e. it is not promise aware, but that should be fine in this situation)
const tweet = function(params) {
  let userId = params.message.user;
  msgToTweet = postCache[userId].content;

  twitterClient.post('statuses/update', {status: msgToTweet})
    .then(function (tweet) {
      console.log('Tweeted: ', msgToTweet);
    })
    .catch(function (error) {
      throw error;
    });

  postCache[userId].sent = true;
  return params;
}

// checkPrefix validates that the message we want to tweet starts with :twitter:
const checkSpecificPrefix = function(prefix) {
  const checkPrefix = function(params) {
    let msgToTweet = params.message.text;
  
    if (!msgToTweet.startsWith(prefix)) {
      console.log(`Message does not start with ${prefix}, ignoring`);
      return;
    }
  
    return params;
  };

  return checkPrefix;
}

const checkUserHasQueuedTweet = function(params) {
  let userId = params.message.user;
  if (!postCache[userId] || postCache[userId] && postCache[userId].sent) return;

  return params;
}

// Initialize app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

const processPipe = function(params, pipe) {
  for (let processor of pipe) {
    console.log(`==> Processing with processor: ${processor.name}`)
    params = processor(params);
    if (!params) return;
  }
}

const queuePipeline = [
  filterChannelJoins,
  checkSpecificPrefix(":twitter:"),
  checkUserPostLimits(1000 * 60 * 1), // 1 min
  printDbg,
  notifyOfQueuedTweet,
  queueTweetWithExpiry(15)
];


const sendPipeline = [
  filterChannelJoins,
  checkSpecificPrefix("yes"),
  checkUserHasQueuedTweet,
  checkTweetExpiry,
  notifyOfTweet,
  tweet
]

app.message((params) => {

  console.log('==> Received message notification');

  let msgToTweet = params.message.text;
  if (msgToTweet.startsWith(":twitter:")) {
    processPipe(queuePipeline);
  }
  if (msgToTweet.startsWith("yes")) {
    processPipe(sendPipeline);
  }
  

});

// Start the app
(async () => {
  const appPort = process.env.PORT || 3000;
  await app.start(appPort);

  console.log(`App is running at ${appPort}`);
})();
