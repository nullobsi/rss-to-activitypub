'use strict';
const express = require('express'),
      router = express.Router(),
    Parser = require("rss-parser");
const {createAcct} = require("./actor");

router.get('/', async function (req, res) {
  let resource = req.query.resource;
  if (!resource || !resource.includes('acct:')) {
    return res.status(400).send('Bad request. Please make sure "acct:USER@DOMAIN" is what you are sending as the "resource" query parameter.');
  }
  else {
    let name = resource.replace('acct:','');
    let db = req.app.get('db');
    let [username, domain] = name.split("@");
    let result = db.prepare('select webfinger from accounts where name = ?').get(name);
    if (result === undefined) {
      // attempt to get nitter user
      let nitterUrl = req.app.get('nitter');
      try {
        let parser = new Parser();
        let feedUrl = `${nitterUrl}/${username}/rss`;
        let feedData = await parser.parseURL(feedUrl);
        let [,webfingerDat] = createAcct(feedData, username, domain, db);
        result = {webfinger: JSON.stringify(webfingerDat)};
      } catch (e) {
        return res.status(404).send(`No record found for ${name} with ${e}`);
      }
    }

    res.json(JSON.parse(result.webfinger));
  }
});

module.exports = router;
