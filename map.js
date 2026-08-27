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

  loadVisitedPins(latitude, longitude, hasRealLocation);
}


/* -----------------------------------------------------
   PART 4: Saving and loading "visited" pins (Supabase)
   ----------------------------------------------------- */

// Remembers the coordinates of whatever spot was just clicked,
// so the modal's Save button knows where to save the pin.
let pendingPinLat = null;
let pendingPinLon = null;

const pinModalOverlay = document.getElementById('pinModalOverlay');
const pinModalPanel = document.getElementById('pinModalPanel');
const pinModalInput = document.getElementById('pinModalInput');
const pinModalCancelButton = document.getElementById('pinModalCancelButton');
const pinModalSaveButton = document.getElementById('pinModalSaveButton');

function handleMapClick(lat, lon) {
  pendingPinLat = lat;
  pendingPinLon = lon;

  pinModalInput.value = ''; // clear out whatever was typed last time
  pinModalOverlay.classList.add('is-open');
  pinModalPanel.classList.add('is-open');
  pinModalInput.focus(); // puts the cursor straight into the text box
}

function closePinModal() {
  pinModalOverlay.classList.remove('is-open');
  pinModalPanel.classList.remove('is-open');
}

pinModalCancelButton.addEventListener('click', closePinModal);
pinModalOverlay.addEventListener('click', closePinModal);

pinModalSaveButton.addEventListener('click', function () {
  const cafeName = pinModalInput.value.trim() || 'Unnamed pin';
  saveVisitedPin(cafeName, pendingPinLat, pendingPinLon);
  closePinModal();
});

// Lets someone just press Enter in the text box instead of
// having to click the Save button every time
pinModalInput.addEventListener('keydown', function (event) {
  if (event.key === 'Enter') {
    pinModalSaveButton.click();
  }
});

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

// Only shows saved pins that are within range of an actual search —
// if nobody searched (just viewing the default fallback view), no
// pins are shown at all, since there's nothing nearby to compare to.
function loadVisitedPins(latitude, longitude, hasRealLocation) {
  if (hasRealLocation === false) {
    return;
  }

  const SEARCH_RADIUS_KM = 3; // matches the radius used everywhere else in the app

  supabaseClient
    .from('visited_cafes')
    .select('*')
    .then(function (result) {
      if (result.error) {
        console.log('Could not load visited pins:', result.error.message);
        return;
      }

      result.data
        .filter(function (pin) {
          const distance = calculateDistanceInKm(latitude, longitude, pin.lat, pin.lon);
          return distance <= SEARCH_RADIUS_KM;
        })
        .forEach(function (pin) {
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
const DEFAULT_MAP_LAT = 15.8949;
const DEFAULT_MAP_LON = 120.2863;
const DEFAULT_MAP_ZOOM = 10; // zoomed way out, since we don't know where they are

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