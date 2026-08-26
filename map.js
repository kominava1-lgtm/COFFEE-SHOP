/* =====================================================
   MAP PAGE
   This file only runs on map.html. It reads the search
   results saved by the homepage (script.js) out of
   localStorage, builds the real Leaflet map, and handles
   pinning "visited" locations by clicking the map.
   ===================================================== */

let userLatitude = null;
let userLongitude = null;
let mapInstance = null;     // holds the map itself, once created
let routingControl = null;  // holds the current "directions" route line, if any


/* -----------------------------------------------------
   PART 1: Distance calculation (Haversine formula) —
   same as script.js, needed here too for popup text.
   ----------------------------------------------------- */

function convertDegreesToRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function calculateDistanceInKm(lat1, lon1, lat2, lon2) {
  const earthRadiusKm = 6371;

  const latDifference = convertDegreesToRadians(lat2 - lat1);
  const lonDifference = convertDegreesToRadians(lon2 - lon1);

  const lat1Radians = convertDegreesToRadians(lat1);
  const lat2Radians = convertDegreesToRadians(lat2);

  const a =
    Math.sin(latDifference / 2) * Math.sin(latDifference / 2) +
    Math.cos(lat1Radians) * Math.cos(lat2Radians) *
    Math.sin(lonDifference / 2) * Math.sin(lonDifference / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}


/* -----------------------------------------------------
   PART 2: Map icons and directions
   ----------------------------------------------------- */

function createUserIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="map-pin-user-wrapper">' +
            '<div class="map-pin-user-ring"></div>' +
            '<div class="map-pin-user-dot"></div>' +
          '</div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

function createCafeIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="map-pin-cafe"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

function clearDirections() {
  if (routingControl !== null) {
    mapInstance.removeControl(routingControl);
    routingControl = null;
  }
}

function showDirectionsTo(destinationLat, destinationLon) {
  clearDirections();

  routingControl = L.Routing.control({
    waypoints: [
      L.latLng(userLatitude, userLongitude),
      L.latLng(destinationLat, destinationLon)
    ],
    routeWhileDragging: false
  }).addTo(mapInstance);
}

function createCafeMarker(cafe) {
  const cafeName = cafe.tags.name || 'Unnamed Coffee Shop';
  const distanceText = calculateDistanceInKm(userLatitude, userLongitude, cafe.lat, cafe.lon).toFixed(2);

  const marker = L.marker([cafe.lat, cafe.lon], { icon: createCafeIcon() }).addTo(mapInstance);

  const popupHTML =
    '<div class="map-popup-name">' + cafeName + '</div>' +
    '<div class="map-popup-distance">' + distanceText + ' km away</div>' +
    '<button class="map-popup-directions-button">Show directions</button>';

  marker.bindPopup(popupHTML);

  marker.on('popupopen', function (event) {
    const popupElement = event.popup.getElement();
    const directionsButton = popupElement.querySelector('.map-popup-directions-button');

    directionsButton.addEventListener('click', function () {
      showDirectionsTo(cafe.lat, cafe.lon);
    });
  });

  return marker;
}


/* -----------------------------------------------------
   PART 3: Building the map itself
   ----------------------------------------------------- */

function initializeMap(latitude, longitude, cafeList, zoomLevel, hasRealLocation) {
  mapInstance = L.map('realMap').setView([latitude, longitude], zoomLevel);

  setTimeout(function () {
    mapInstance.invalidateSize();
  }, 100);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO'
  }).addTo(mapInstance);

  // Only show the "You are here" pin if we actually know where they are —
  // showing it at a fake default location would be misleading.
  if (hasRealLocation) {
    L.marker([latitude, longitude], { icon: createUserIcon() }).addTo(mapInstance)
      .bindPopup('You are here');
  }

  cafeList.forEach(function (cafe) {
    createCafeMarker(cafe);
  });

  mapInstance.on('click', function (event) {
    const clickedLat = event.latlng.lat;
    const clickedLon = event.latlng.lng;
    handleMapClick(clickedLat, clickedLon);
  });

  loadVisitedPins();
}


/* -----------------------------------------------------
   PART 4: Saving and loading "visited" pins (Supabase)
   ----------------------------------------------------- */

function handleMapClick(lat, lon) {
  const cafeName = window.prompt('Name this location (e.g. the cafe you visited):');

  if (cafeName === null) {
    return; // they hit Cancel
  }

  saveVisitedPin(cafeName.trim() || 'Unnamed pin', lat, lon);
}

function saveVisitedPin(cafeName, lat, lon) {
  supabaseClient
    .from('visited_cafes')
    .insert({ cafe_name: cafeName, lat: lat, lon: lon })
    .then(function (result) {
      if (result.error) {
        console.log('Could not save pin:', result.error.message);
        return;
      }

      console.log('Saved pin:', cafeName);

      L.marker([lat, lon])
        .addTo(mapInstance)
        .bindPopup('✅ Visited: ' + cafeName);
    });
}

function loadVisitedPins() {
  supabaseClient
    .from('visited_cafes')
    .select('*')
    .then(function (result) {
      if (result.error) {
        console.log('Could not load visited pins:', result.error.message);
        return;
      }

      result.data.forEach(function (pin) {
        L.marker([pin.lat, pin.lon])
          .addTo(mapInstance)
          .bindPopup('✅ Visited: ' + (pin.cafe_name || 'Unnamed pin'));
      });
    });
}


/* -----------------------------------------------------
   PART 5: Reading the data the homepage saved for us,
   then kicking everything off
   ----------------------------------------------------- */

// A generic fallback center for when nobody has searched yet —
// this is just "somewhere to show," not tied to any real user.
const DEFAULT_MAP_LAT = 20;
const DEFAULT_MAP_LON = 0;
const DEFAULT_MAP_ZOOM = 2; // zoomed way out, since we don't know where they are

const savedDataText = localStorage.getItem('espressoXpressMapData');

if (savedDataText === null) {
  // Nobody searched yet — show a general world view instead of blocking access.
  userLatitude = DEFAULT_MAP_LAT;
  userLongitude = DEFAULT_MAP_LON;

  initializeMap(DEFAULT_MAP_LAT, DEFAULT_MAP_LON, [], DEFAULT_MAP_ZOOM, false);
} else {
  const savedData = JSON.parse(savedDataText);
  userLatitude = savedData.lat;
  userLongitude = savedData.lon;

  initializeMap(savedData.lat, savedData.lon, savedData.cafes, 15, true);
}