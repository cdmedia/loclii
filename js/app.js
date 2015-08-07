var geoAvailable = false;
var geoData = [];
var geoPlace = [];

$('.placeholder').hide();

// Check for geolocation api
if ("geolocation" in navigator) {
    geoAvailable = true;
} else {
    geoAvailable = false;
    App.dialog({
      title        : 'Geolocation Error',
      text         : 'Looks like we cannot find you. Please upgrade to a newer browser',
      okButton     : 'OK'
    });
}

// YQL serves JSONP (with a callback) so all we have to do
// is create a script element with the right 'src':
function YQLQuery(query, callback) {
    this.query = query;
    this.callback = callback || function(){};
    this.fetch = function() {

        if (!this.query || !this.callback) {
            throw new Error('YQLQuery.fetch(): Parameters may be undefined');
        }

        var scriptEl = document.createElement('script'),
            uid = 'yql' + +new Date(),
            encodedQuery = encodeURIComponent(this.query.toLowerCase()),
            instance = this;

        YQLQuery[uid] = function(json) {
            instance.callback(json);
            delete YQLQuery[uid];
            document.body.removeChild(scriptEl);
        };

        scriptEl.src = 'https://query.yahooapis.com/v1/public/yql?q='
                     + encodedQuery + '&format=json&callback=YQLQuery.' + uid;
        document.body.appendChild(scriptEl);

    };
}

/*
 * Get geolocation
 */
function getGeolocation() {
    var success = function(position) {
        geoData.push(position);
        getGeoPlace(position); // Get zip code using position from geolocation
        return position;
    };
    var error = function(error) {
        switch(error.code)
        {
            case error.PERMISSION_DENIED:
                App.dialog({
                    title        : 'Geolocation Error',
                    text         : 'Looks like we cannot find you. Please enable location services for this site.',
                    okButton     : 'OK'
                });
            break;

            case error.POSITION_UNAVAILABLE: alert("could not detect current position");
            break;

            case error.TIMEOUT:
                App.dialog({
                    title        : 'Geolocation Error',
                    text         : 'Retrieving position timeout. Please try reloading the page.',
                    okButton     : 'OK'
                });
            break;

            default: alert("unknown error");
            break;
        }
        return false;
    };
    window.navigator.geolocation.getCurrentPosition(success, error, {timeout:10000});
}

/*
 * Get geo place location based on Yahoo YQL
 * @position Navigator geolocation object
 */
function getGeoPlace(position) {
    var callback = function(data) {
        function yPlace(place) {
            this.place = place;
        }
        var place = new yPlace(data.query.results.Result);
        geoPlace.push(place); // Store geoPlace data in geoData variable
    };

    var query = 'SELECT * FROM geo.placefinder WHERE text="' + position.coords.latitude + ',' + position.coords.longitude + '" and gflags="R"';
    var place = new YQLQuery(query, callback);
    place.fetch();
}

function buildResults(data) {
    var results = data.query.results.Result;
    var resultCount = data.query.count;
    var location = results[0].City + ', ' + results[0].State;
    var container = '<ul class="app-list"><label>Displaying ' + resultCount + ' results near ' + location + '</label></ul>';

    // Hide placeholder
    $('.placeholder').hide();

    // Show loader
    $('.loader').show();
    setTimeout(function() {
        $('.loader').hide();
        // Build results list
        $('.results').empty();
        $('.results').append(container);
        $.each(results, function(i, val){
            var listContent = '<li class="result-item-' + val.id + '">' + val.Title + '<span class="list-distance">' + val.Distance + ' m</span></li>';
            $('.app-list').append(listContent);
            $('.result-item-' + val.id).on('click', function(){
                App.load('detailView', val);
            });
            console.log(val);
        });
    }, 2000);
    console.log(data);
}

function performSearch(input) {
    var value = input.value;

    // Clean up spaces from the search query
    value = value.trim();

    // Unfocus search input
    input.blur();

    // Build YQL Search query
    var zipcode = geoPlace[0].place.uzip;
    var query = 'SELECT * FROM local.search(20) WHERE query="' + value + '" and location="' + zipcode + '"';
    var request = new YQLQuery(query, buildResults);
    request.fetch();
    console.log(request);
}


App.controller('listView', function (page) {
    // Get initial geolocation for search
    getGeolocation();

    // Show loader while geo is working
    $('.loader').show();
    setTimeout(function() {
        $('.loader').hide();
        $('.placeholder').show();
    }, 2500);

    // Get HTML elements
    var form        = page.querySelector('form'),
        input       = page.querySelector('form .app-input'),
        placeHolder = page.querySelector('.placeholder'),
        resultTmpl  = page.querySelector('.result');

    form.addEventListener('submit', function(e) {
         e.preventDefault();

        // If user tries to search before geo is loaded
        if (typeof geoPlace[0] === "undefined") {
            App.dialog({
                    title        : 'Whooooah',
                    text         : 'Slow down there, sonny...we are still trying to figure out where you are. Try searching again.',
                    okButton     : 'OK'
                });
        } else {
            performSearch(input);
        }
    });
});


App.controller('detailView', function (page, data) {
    this.transition = 'rotate-right';

    // Insert data into HTML elements
    $(page).find('.title').text(data.Title);
    $(page).find('.address').text(data.Address + ' ');
    $(page).find('.city-state').text(data.City + ', ' + data.State);
    $(page).find('.distance').text(data.Distance + ' miles away');
    $(page).find('.phone').text(data.Phone);

    // Ratings
    var numberOfRatings = parseInt(data.Rating.TotalRatings);
    var averageRating = parseInt(data.Rating.AverageRating);
    if(numberOfRatings > 0) {
        for(i=0; i < 5; i++){
            // Good stars
            if(i < averageRating){
                $(page).find('.rating-stars').append('<i class="fa fa-star"></i>');
            }else{
                $(page).find('.rating-stars').append('<i class="fa fa-star-o"></i>');
            }
        }
        $(page).find('.no-ratings').text(' (' + numberOfRatings + ' Ratings)');
    }

    // Reviews
    var totalReviews = parseInt(data.Rating.TotalReviews);
    var latestReviewDate = new Date(data.Rating.LastReviewDate * 1000);
    var latestReview = data.Rating.LastReviewIntro;
    if(totalReviews > 0){
        $(page)
            .find('.review-section')
            .html('<div class="app-section"><h4>' + totalReviews + ' Reviews</h4><div><span class="latest-review-date">' + latestReviewDate + '</span><p class="latest-review">' + latestReview + '</p></div></div>');
    }

    // Update links
    $(page).find('.call').attr("href", 'tel:' + data.MapPhone);
    $(page).find('.directions').attr("href", data.MapUrl).attr("target", "_blank");
    $(page).find('.website').attr("href", data.BusinessUrl).attr("target", "_blank");
});

try {
    App.restore();
} catch (err) {
    App.load('listView');
}