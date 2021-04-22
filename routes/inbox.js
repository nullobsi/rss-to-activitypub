'use strict';
const express = require('express'),
      crypto = require('crypto'),
      request = require('request'),
      fs = require('fs'),
      router = express.Router(),
      Parser = require("rss-parser");
const {getAccount} = require("../nitter");

function signAndSend(message, name, domain, req, res, targetDomain) {
  // get the URI of the actor object and append 'inbox' to it
  let inbox = message.object.actor+'/inbox';
  let inboxFragment = inbox.replace('https://'+targetDomain,'');
  // get the private key
  let db = req.app.get('db');
  let result = db.prepare('select privkey from accounts where name = ?').get(`${name}@${domain}`);
  if (result === undefined) {
    return res.status(404).send(`No record found for ${name}.`);
  }
  else {
    // digest
    const digest = crypto.createHash('sha256').update(JSON.stringify(message)).digest('base64');

    let privkey = result.privkey;
    const signer = crypto.createSign('sha256');
    let d = new Date();
    let stringToSign = `(request-target): post ${inboxFragment}\nhost: ${targetDomain}\ndate: ${d.toUTCString()}\ndigest: SHA-256=${digest}`;
    signer.update(stringToSign);
    signer.end();
    const signature = signer.sign(privkey);
    const signature_b64 = signature.toString('base64');
    const algorithm = 'rsa-sha256';
    let header = `keyId="https://${domain}/u/${name}",algorithm="${algorithm}",headers="(request-target) host date digest",signature="${signature_b64}"`;
    console.log('signature:',header);
    console.log('message:',message);

    request({
      url: inbox,
      headers: {
        'Host': targetDomain,
        'Date': d.toUTCString(),
        'Signature': header,
        'Digest': `SHA-256=${digest}`,
        'Content-Type': 'application/activity+json',
        'Accept': 'application/activity+json'
      },
      method: 'POST',
      json: true,
      body: message
    }, function (error, response, body){
    });
    res.json('done');
  }
}

function sendAcceptMessage(thebody, name, domain, req, res, targetDomain) {
  const guid = crypto.randomBytes(16).toString('hex');
  console.log(thebody);
  let message = {
    '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
    'id': `https://${domain}/${guid}`,
    'type': 'Accept',
    'actor': `https://${domain}/u/${name}`,
    'object': thebody,
  };
  signAndSend(message, name, domain, req, res, targetDomain);
}

router.post('/', async function (req, res) {
  // pass in a name for an account, if the account doesn't exist, create it!
  let domain = req.app.get('domain');
  if (req.body.actor === undefined) {
    return res.status(400).send(`No actor specified.`);
  }
  const myURL = new URL(req.body.actor);
  let targetDomain = myURL.hostname;
  fs.appendFile('./inbox.log', JSON.stringify(req.body)+'\r\n', function (err) {
     if (err) {
       return console.log(err);
     }
  });
  // TODO: add "Undo" follow event
  if (typeof req.body.object === 'string' && req.body.type === 'Follow') {
    let name = req.body.object.replace(`https://${domain}/u/`,'');
    sendAcceptMessage(req.body, name, domain, req, res, targetDomain);
    // Add the user to the DB of accounts that follow the account
    let db = req.app.get('db');
    // get the followers JSON for the user
    let result = await getAccount(name, 'followers');
    if (result === undefined) {
      console.log(`No record found for ${name}.`);
    }
    else {
      // update followers
      let followers = result.followers;
      if (followers) {
        followers.push(req.body.actor);
        // unique items
        followers = [...new Set(followers)];
      }
      else {
        followers = [req.body.actor];
      }
      let followersText = JSON.stringify(followers);
      console.log('adding followersText', followersText);
      // update into DB
      db.prepare('update accounts set followers = ? where name = ?').run(followersText, `${name}@${domain}`);

      // if rss feed does not exist, add it
      let nitterUrl = req.app.get('nitter');
      let feedUrl = `${nitterUrl}/${name}/rss`;
      let parser = new Parser();
      parser.parseURL(feedUrl, (err, feedData) => {
        db.prepare('insert or replace into feeds(feed, username, content) values(?, ?, ?)').run(feedUrl, name, JSON.stringify(feedData));
      });
    }
  } else if (req.body.type === "Undo" && typeof req.body.object === "object" && typeof req.body.object.object === "string" && req.body.object.type == "Follow") {
    let name = req.body.object.replace(`https://${domain}/u/`,'');
    let db = req.app.get('db');
    let result = await getAccount(name, 'followers');
    if (result === undefined) {
      return res.json('Does not exist');
    }
    let f = result.followers;
    if (f) {
      f = f.filter(v => v !== req.body.actor);
    } else f = [];
    let fTxt = JSON.stringify(f);
    db.prepare('update accounts set followers = ? where name = ?').run(fTxt, `${name}@${domain}`);
  }
});

module.exports = router;
