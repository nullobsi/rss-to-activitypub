'use strict';
const express = require('express'),
      router = express.Router(),
    Parser = require("rss-parser");
const {getAccount} = require("../nitter");
const {createAcct} = require("./actor");

router.get('/', async function (req, res) {
  let resource = req.query.resource;
  if (!resource || !resource.includes('acct:')) {
    return res.status(400).send('Bad request. Please make sure "acct:USER@DOMAIN" is what you are sending as the "resource" query parameter.');
  }
  else {
    let name = resource.replace('acct:','');
    let [username] = name.split("@");
    let result = await getAccount(username, 'webfinger');
    if (result === undefined) {
      return res.status(404).send(`No record found for ${name}`);
    }

    res.json(result.webfinger);
  }
});

module.exports = router;
