const { App } = require('@slack/bolt');
const twitter = require('twitter');

const msgTxtForTweeting = ':twitter:'

// Initialize Twitter
var twitterClient = new twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
});

// Initialize Slack
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});
let slackPostEphemeral = async (channel, user, msgToSend, blocks) => {
  console.log(`ephemerally posting: ${msgToSend}`);
  let msg = {
    token: process.env.SLACK_BOT_TOKEN,
    channel,
    user,
    text: msgToSend
  };
  if (blocks) msg.blocks = blocks;
  return await app.client.chat.postEphemeral(msg);
};

// debug mode:
// - triggers pipeline on all messages (and not just ones with msgTxtForTweeting)
// - disables posting to twitter and only dumps to console
var debugMode = process.env.DEBUG_MODE || false;



// Pipeline methods
// And need to return params if the pipeline is to continue


// Message Pipeline
// All receive params:{context, body, payload, event, message, say, next}

const filterChannelJoins = async function(params) {
  if (params.message.subtype && params.message.subtype === 'channel_join') return;
  return params;
}

var postCache = {}; // TODO: ideally move to a db
const checkUserPostLimits = function(validDelay) {
  let checkSpecifiedUserPostLimits = async function(params) {
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

const printDbg = async function(params) {
  console.log('Debug - message:', params.message);
  return params;
}

const confirmMsgForTweet = async function(params) {
  let msgToTweet = params.message.text;
  msgToTweet = msgToTweet.replace(new RegExp(msgTxtForTweeting, 'g'),'')

  let notifyTxt = 'Want me to tweet?'
  let msgToSend = `Hey there <@${params.message.user}>! - I can tweet that for you.`;
  let prompt = `Shall I go ahead and tweet: '${msgToTweet}'?`;

  let getButtonBlock = (actionId, actionValue, btnText, btnStyle)=>{
    return {
      type: 'button',
      text: {
        type: 'plain_text',
        text: btnText
      },
      style: btnStyle, // default, primary, danger
      action_id: `${actionId}_${actionValue}`,
      value: actionValue
    };
  };

  let actionId = 'tweetConfirmation_' + params.message.ts;
  await slackPostEphemeral(params.message.channel, params.message.user, notifyTxt, [
    { type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${msgToSend}\n${prompt}`
    }},
    { type: 'actions',
      elements: [
        getButtonBlock(actionId, 'yes', 'Yes, please!', 'primary'),
        getButtonBlock(actionId, 'no' , 'No, thank you.', 'danger'),
    ]}
  ]);

  return params;
}

// // QueueTweetWithExpiry will add the tweet and content to a cache which expires after a finite amount of time (default 15 minutes).
const queueTweetWithExpiry = function(expiryInMS = 1000 * 60 * 15) {
  let queueTweet = async function(params) {
    let msgToTweet = params.message.text;
    msgToTweet = msgToTweet.replace(new RegExp(msgTxtForTweeting, 'g'),'')
    let userId = params.message.user;
    postCache[userId] = {
      id: params.message.ts,
      content: msgToTweet,
      lastPostTime: new Date(),
      expiry: new Date(new Date().getTime() + expiryInMS)
    };
    return params;
  };

  return queueTweet;
}

// const checkTweetExpiry = async function(params) {
//   let now = new Date();
//   let userId = params.message.user;
//   let postExpiry = postCache[userId] && postCache[userId].expiry;
//     if (postExpiry) {
//       if (now > postExpiry) return;
//     }
//
//     return params;
// }

const tweet = async function(msgToTweet) {
  let tweetRet;
  if (!debugMode) {
    tweetRet = await twitterClient.post('statuses/update', {status: msgToTweet});
  } else {
    tweetRet = { status: 'DEBUG_MODE: did not really send' };
  }
  console.log(`Tweeted: ${msgToTweet} - Received: `, tweetRet);
}

// checkPrefix validates that the message we want to tweet starts with :twitter:
const checkSpecificPrefix = function(prefix) {
  const checkPrefix = async function(params) {
    let msgToTweet = params.message.text;

    if (debugMode) {
      console.log(`DEBUG_MODE: skipping prefix check`);
      return params;
    }

    if (!msgToTweet.startsWith(prefix)) {
      console.log(`Message does not start with ${prefix}, ignoring`);
      return;
    }

    return params;
  };

  return checkPrefix;
}

// const checkUserHasQueuedTweet = async function(params) {
//   let userId = params.message.user;
//   if (!postCache[userId] || postCache[userId] && postCache[userId].sent) return;
//
//   return params;
// }


const processPipe = async function(pipeName, pipe, params) {
  console.log(`==> [${pipeName}] Received notification`);

  for (let processor of pipe) {
    console.log(`==> [${pipeName}] Processing with processor: ${processor.name}`)
    params = await processor(params);
    if (!params) {
      console.log(`<== [${pipeName}] Finished processing`)
      return;
    }
  }
  console.log(`<== [${pipeName}] Finished processing`)
}

const messagePipeline = [
  filterChannelJoins,
  checkSpecificPrefix(msgTxtForTweeting),
  checkUserPostLimits(1000 * 60 * 1), // 1 min
  queueTweetWithExpiry(1000 * 60 * 15), // 15 min
  confirmMsgForTweet,
  printDbg
];


app.message(async (params) => {
  await processPipe('message', messagePipeline, params);
});

app.action(/tweetConfirmation.*/, async (params) => {
  params.ack();

  if (params.action.value === 'no') return;

  // console.log(Object.keys(params));
  // console.log('action: ', params.action);
  // console.log('body: ', params.body);
  // console.log('container: ', params.body.container);

  let msgId = params.action.action_id.split('_')[1];
  let userId = params.body.user.id;
  let postInfo = postCache[userId];
  if (postInfo) {
    if (postInfo.id === msgId) {
      await slackPostEphemeral(params.body.container.channel_id, params.body.user.id, `Going ahead and tweeting: ${postInfo.content}`);
      await tweet(postInfo.content);
      delete postCache.userId;
    } else {
      await slackPostEphemeral(params.body.container.channel_id, params.body.user.id, 'Received confirmation on old message - ignoring');
    }
  } else {
    await slackPostEphemeral(params.body.container.channel_id, params.body.user.id, 'Sorry, could not find messages from you!');
  }

});

// Start the app
(async () => {
  const appPort = process.env.PORT || 3000;
  await app.start(appPort);

  console.log(`App is running at ${appPort}`);
})();
