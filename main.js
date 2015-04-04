/*jshint asi:true */

var https = require('https')
var fs = require('fs')
var util = require('util')
var schedule = require('node-schedule');
var Flickr = require('flickrapi')

var credentials = JSON.parse(fs.readFileSync('./credentials.json'))

var flickr_credentials = {
  api_key: credentials.flickr.api_key,
  secret: credentials.flickr.secret
}

var tumblr = require('tumblr.js');
var tumblr_api_client = tumblr.createClient({
  consumer_key: credentials.tumblr.consumer_key,
  consumer_secret: credentials.tumblr.consumer_secret,
  token: credentials.tumblr.token,
  token_secret: credentials.tumblr.token_secret
});

var twitterAPI = require('node-twitter-api');
var twitter = new twitterAPI({
  consumerKey: credentials.twitter.consumerKey,
  consumerSecret: credentials.twitter.consumerSecet,
  callback: credentials.twitter.callback
});

var accessToken = credentials.twitter.accessToken
var accessSecret = credentials.twitter.accessSecret

find_image()

function find_image() {

  Flickr.tokenOnly(flickr_credentials, function (err, flickr) {

    console.log('Searching Flickr for images')
    // longmin   latmin  longmax   latmax
    //-26.000   62.000   -6.000   67.117

    var lat = (62 + (Math.random() * 5.117))
    var lon = (-6 + Math.random() * -26)

    console.log(['coords ', lat, lon].join('\t'))

    flickr.photos.search({
      lat: lat,
      lon: lon,
      radius: 2,
      extras: 'original_format',
      format: 'json'
    }, function (err, result) {

      console.log('search complete!')

      if(err){
        util.log('error found!')
        return;
      }

      console.log('total results found: ' + parseInt(result.photos.total))

      var photo_id = Math.floor(Math.random() * result.photos.total)

      if (result.photos.total !== '0' && result.photos.photo[photo_id] !== undefined && !isNaN(parseInt(result.photos.total))) {

        util.log('choosing')
        util.log(photo_id)
        console.log(result.photos.photo[photo_id])

        util.log('scheduling another run 60 * 10 * 1000ms from now')
        schedule.scheduleJob(new Date(Date.now() + (60 * 30 * 1000)), function () {
          util.log('retrigger')
          find_image()
        })

        download_and_save_image(result.photos.photo[photo_id], lat, lon)

      } else {

        // util.log('scheduling another try in 1000ms')

        schedule.scheduleJob(new Date(Date.now()+1000), function () {
          // util.log('performing another try')
          find_image()
        })

      }

    })

  })

}


function download_and_save_image(photo, lat, lon) {

  // console.log(util.inspect(photo))

  var farm_id = photo.farm
  var server_id = photo.server
  var id = photo.id
  var secret = photo.secret
  var original_secret = photo.originalsecret
  var original_extension = photo.originalformat

  var url = ['https://farm', farm_id, '.staticflickr.com/',
    server_id, '/', id, '_', original_secret, '_o.', original_extension
  ].join('')

  if (original_secret === undefined) {
    url = ['https://farm', farm_id, '.staticflickr.com/', server_id, '/', id, '_', secret, '.jpg'].join('')
  }

  util.log(['url', url].join('\t'))

  var caption = ''

  if (photo.title !== undefined) {
    caption = photo.title
  }

  if (original_extension === undefined) {
    original_extension = 'jpg'
  }

  var local_filename = id + '.' + original_extension

  var file = fs.createWriteStream(id + '.' + original_extension);

  https.get(
    url,
    function (response) {
      response.pipe(file);
    }
  );

  file.on('finish', function () {

    util.log('file done being downloaded to disk.')
    // return;

    var options = {
      tags: 'iceland',
      caption: caption,
      link: 'http://maps.google.com/maps?z=1&t=m&q=loc:' + lat + '+' + lon,
      data: (__dirname + '/' + local_filename)
    };

    util.log('uploading to tumblr')
    tumblr_api_client.photo('randomiceland', options, function (err, response) {
      util.log('done uploading to tumblr')
    })

    //
    util.log('tweeting')
    twitter.statuses('update_with_media', {
        media: [
          (__dirname + '/' + local_filename)
        ],
        status: options.caption + ' ' + options.link + ' #iceland'
      },
      accessToken,
      accessSecret,
      function (error, data, response) {
        if (error) {
          // something went wrong
          util.log('error tweeting')
          util.log(error)

        } else {
          util.log('success tweeting')
        }
      }
    )

  })

}
