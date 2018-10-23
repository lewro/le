// Google Map
function init() {

  // Only on Register View
  if($('.register').length > 0) {

    // Set lat long if already exist
    var longtitude = parseFloat($('#id_longtitude').val());
    var latitude   = parseFloat($('#id_latitude').val());
    var zoom       = 15;

    if (longtitude > 0) {
    } else {
      longtitude = 14.4189935;
    }

    if (latitude > 0) {
    } else {
      latitude = 50.0875726;
    }

    var myLatLng = {lat: latitude, lng: longtitude};

    var map = new google.maps.Map(document.getElementById('map-canvas'), {
      zoom: zoom,
      center: myLatLng
    });

    var searchBox = new google.maps.places.SearchBox(document.getElementById('pac-input'));

    map.controls[google.maps.ControlPosition.TOP_CENTER].push(document.getElementById('pac-input'));

    google.maps.event.addListener(searchBox, 'places_changed', function() {

    searchBox.set('map', null);

    var places = searchBox.getPlaces();

    var bounds = new google.maps.LatLngBounds();

    var i, place;
    for (i = 0; place = places[i]; i++) {
     (function(place) {

       var marker = new google.maps.Marker({
         position: place.geometry.location
       });

       latitude   = place.geometry.location.lat().toFixed(7)
       longtitude = place.geometry.location.lng().toFixed(7);

       $("#id_latitude").focus().val(latitude);
       $("#id_longtitude").focus().val(longtitude);

       marker.bindTo('map', searchBox, 'map');

       google.maps.event.addListener(marker, 'map_changed', function() {
         if (!this.getMap()) {
           this.unbindAll();
         }
       });

       bounds.extend(place.geometry.location);

     }(place));

    }
    map.fitBounds(bounds);
    searchBox.set('map', map);
    map.setZoom(Math.min(map.getZoom(),17));
   });
  }


  // Only on Expert View
  if($('.expert').length > 0) {

    // Set lat long if already exist
    var longtitude = parseFloat($('#id_longtitude').val());
    var latitude   = parseFloat($('#id_latitude').val());
    var zoom       = 17;

    var myLatLng = {lat: latitude, lng: longtitude};

    var map = new google.maps.Map(document.getElementById('map-canvas'), {
      zoom: zoom,
      center: myLatLng
    });

    var marker = new google.maps.Marker({
      position: myLatLng,
      map: map
    });

  }
}

google.maps.event.addDomListener(window, 'load', init);

document.addEventListener("DOMContentLoaded", function(event) {
  init();
});
