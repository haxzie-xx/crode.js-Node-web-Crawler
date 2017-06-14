var express = require('express');
var app = express();
var fs = require('fs');
var request = require('request');
var cheerio = require('cheerio');
var path = require('path');
var mongodb = require('mongoose');
var Crawler = require("crawler");
mongodb.connect('mongodb://127.0.01/my_db');

//mongodb schema for storing links in database
var linkSchema = mongodb.Schema({
  name: String,
  url: String,
  date: String
});
var Link = mongodb.model("Link", linkSchema);

//mongodb schema for storing visited links in database
var linkDump = mongodb.Schema({
  url: String,
  date: String
});
var DumpLink = mongodb.model("DumpLink", linkDump);


app.use(express.static('public'));
app.set('view engine','ejs');
var visited = [];
//setting up the crawler
var c = new Crawler({
    maxConnections : 10,
    // This will be called for each crawled page
    callback : function (error, res, done) {
        if(error){
            console.log(error);
        }else{
            var rootUrl = res.options.uri;
            console.log('uri '+rootUrl);
            var $ = res.$;
            //store all anchors in links
            links = $('a');

            //loop through each link
            $(links).each(function(i, link){

              //if the url is of mp4, mov, mkv or avi extension
              if ((/\.(mkv|mov|mp4|avi)$/i).test(""+$(link).attr('href'))) {
                var fileUrl = rootUrl+$(link).attr('href');
                var fileName = $(link).text().replace(/\./g," ");
                var fileName = fileName.replace(/&gt;/g," ");
                var fileName =fileName.replace(/%20/g," ");

                //check whether the link already exists in database
                Link.find({name: fileName}, function(err, docs){
                  if (docs.length) {
                    console.error(i+' name already exists');
                  }else {
                    console.log('------------------new file');
                    //create a new link object for mongodb schema to save
                    var newLink = new Link({
                      name: fileName,
                      url: rootUrl+$(link).attr('href'),
                      date: getDateTime()
                    });

                    //save the new link
                    saveNewLink(newLink);
                  }
                });

              }else {
                //link which are not movies test
                  if ((/\/$/i).test($(link).attr('href'))) {

                    if ($(link).text().trim() != '../' && $(link).text().trim() != 'Parent Directory' && $(link).text().trim() != 'Parent Directory/' && $(link).text().trim() != 'Parent directory/' && $(link).text().trim() != 'Parent directory') {
                      console.log('dir : '+$(link).attr('href'));
                      DumpLink.find({url: rootUrl+$(link).attr('href')}, function(err, docs){
                        console.log('dir: '+rootUrl+$(link).attr('href'));
                      if (docs.length) {
                          console.log('-------------------------------------------------dir exists');
                      }else {
                        console.log('queuing dir '+$(link).attr('href'));
                        c.queue(rootUrl+$(link).attr('href'));
                        var newDumpLink = new DumpLink({
                          url: rootUrl+$(link).attr('href'),
                          date: getDateTime
                        });
                        saveDumpLink(newDumpLink);

                      }
                    });
                    }

                  }
              }
            });
        }
        done();
    }
});


//send the html page to input scrape links for home
app.get('/',function(req, res){
  res.render('search');

});

//to display all the movies
app.get('/all',function(req, res){

  Link.count(function(err, results){
    if (err) {
      res.send('couldnt load the result');
    }else{
      res.json(results);
      console.log('search complete');
    }
  });
});

//to display all the movies
app.get('/allDump',function(req, res){

  DumpLink.count(function(err, results){
    if (err) {
      res.send('couldnt load the result');
    }else{
      res.json(results);
      console.log('search complete');
    }
  });
});

//function to search a movies
app.get('/search', function(req, res){
  var query = req.query.q;
  if (query) {
    if (query.length > 2) {
      query = query.replace(' ','|');
      Link.find({name: new RegExp('(' + query + ')', 'ig')}, function(err, result){
        if (err) {
          res.end();
        }else if (result.length) {
          res.render('movieResults', {links : result});
        }else {
          res.end();
        }
        });
    }else{
      res.redirect('/');
    }
  }else{
    res.redirect('/');
  }

  // Link.find({name: requery}, function(err, result){
  //   if (err) {
  //     res.send('nothing found, its an error');
  //   }else{
  //     res.json(result);
  //   }
  // });

});


app.get('/crawl', function(req, res){

  var url = req.query.url;
  if (typeof url != 'undefined') {
    if (url.test(/^http:\/\//)) {
      c.queue(url);
      console.log('queued url : '+url);
      res.render('crawl',{ status: 'true'});
    }


  }else {
  res.render('crawl',{ status: 'false'});
  }

});
//get the scrape url params and scrape
app.get('/scrape', function(req, res){

  rootUrl = req.query.url;

  request(rootUrl, function(error, response, html){
    if (!error) {

      console.log('we are in :)');

      //load the html file into $
      var $ = cheerio.load(html);

      //store all anchors in links
      links = $('a');

      //loop through each link
      $(links).each(function(i, link){

        //if the url is of mp4, mov, mkv or avi extension
        if ((/\.(mkv|mov|mp4|avi)$/i).test(""+$(link).attr('href'))) {
          var fileUrl = rootUrl+$(link).attr('href');
          var fileName = $(link).text().replace(/\./g," ");
          var fileName = fileName.replace(/&gt;/g," ");
          var fileName =fileName.replace(/%20/g," ");

          //check whether the link already exists in database
          Link.find({name: fileName}, function(err, docs){
            if (docs.length) {
              console.error(i+' name already exists');
            }else {
              //create a new link object for mongodb schema to save
              var newLink = new Link({
                name: fileName,
                url: rootUrl+$(link).attr('href'),
                date: getDateTime()
              });

              //save the new link
              saveNewLink(newLink);
            }
          });

        }else {
          //link which are not movies test
          console.log(i+' no movies in : '+$(link).attr('href'));
        }
      });

      //send response after scrapping
      res.send('Done');
    }
  });
});

//function to return current date and time
function getDateTime(){
  var newDate = new Date();
  var datetime = newDate.getDate()+"/"+newDate.getMonth()+"/"+newDate.getFullYear()+" "+ newDate.getHours()+":"+newDate.getMinutes();
  return datetime;
}

//function to save link to database
function saveNewLink(newLink) {
  //save the link to database
  newLink.save(function(err, Link){
    if (err) {
      console.log('cannot save link '+rootUrl+$(link).attr('href'));
    }else{
      console.log(' link Saved !');
    }
  });
}

//function to save DUmpLink on database
function saveDumpLink(dumpLink){
  dumpLink.save(function(err, dumpLink){
    if (err) {
      console.log('Cannot save DumpLink, Database error');
    }else{
      console.log('DumpLink saved!');
    }
  });
}
//setup the server to listen to port 8080
server = app.listen(8083, function(){
  console.log('Listening to http://127.0.0.1:8082');
});

// var handler = function(){
//   app.close();
// }
