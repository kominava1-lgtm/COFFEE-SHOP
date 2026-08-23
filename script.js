/* =====================================================
   PART 1: "Use my location" button
   Asks the browser for the user's real GPS location,
   then searches OpenStreetMap for cafes within 3km.
   ===================================================== */

const locateButton = document.getElementById('locateMeButton');

let userLatitude = null;
let userLongitude = null;

const normalButtonContent =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none">' +
    '<circle cx="12" cy="12" r="3" stroke="#F3E6CC" stroke-width="2"/>' +
    '<path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#F3E6CC" stroke-width="2" stroke-linecap="round"/>' +
  '</svg> Use my location';

const loadingButtonContent = 'Locating…';

const successButtonContent =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none">' +
    '<path d="M20 6L9 17l-5-5" stroke="#F3E6CC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
  '</svg> Located you';

// Asks OpenStreetMap (via the Overpass API) for cafes, coffee shops,
// and coffee-serving spots near a point. No API key needed — this
// service is free and open.
function searchNearbyCoffeeShops(latitude, longitude) {
  const radiusInMeters = 3000; // 3km, matches our requirement

  // Three separate tags can all mean "coffee shop" in OpenStreetMap:
  // amenity=cafe (the standard cafe tag), shop=coffee (a coffee-focused
  // shop/roastery), and cuisine=coffee_shop (a place — like a bakery or
  // fast food spot — that lists coffee as what it serves). We search
  // for all three, as both nodes (single points) and ways (buildings/areas).
  const overpassQuery = `
    [out:json][timeout:25];
    (
      node["amenity"="cafe"](around:${radiusInMeters},${latitude},${longitude});
      way["amenity"="cafe"](around:${radiusInMeters},${latitude},${longitude});
      node["shop"="coffee"](around:${radiusInMeters},${latitude},${longitude});
      way["shop"="coffee"](around:${radiusInMeters},${latitude},${longitude});
      node["cuisine"="coffee_shop"](around:${radiusInMeters},${latitude},${longitude});
      way["cuisine"="coffee_shop"](around:${radiusInMeters},${latitude},${longitude});
    );
    out center;
  `;

  fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: overpassQuery
  })
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      // Nodes have lat/lon directly on them, but ways (buildings/areas)
      // only get coordinates through the "center" field added by
      // "out center;" above — so we copy that up to lat/lon for ways,
      // meaning the rest of the app can treat every result the same way.
      const coffeeShops = normalizeElementCoordinates(data.elements);

      console.log('Found ' + coffeeShops.length + ' coffee shops:', coffeeShops);
      displayCoffeeShops(coffeeShops);
      renderRadarCafes(coffeeShops);
      // showRealMap(latitude, longitude, coffeeShops); // wiring this in comes next
    })
    .catch(function (error) {
      console.log('Overpass search failed:', error);
    });
}

// Ways don't have lat/lon directly — with "out center;", Overpass adds
// a nested "center": { lat, lon } object instead. This copies that up
// to the top level so every result (node or way) has plain .lat/.lon.
function normalizeElementCoordinates(elements) {
  return elements.map(function (element) {
    if (element.lat === undefined && element.center) {
      element.lat = element.center.lat;
      element.lon = element.center.lon;
    }
    return element;
  });
}

// Runs if the browser successfully gets a location
function handleLocationSuccess(position) {
  userLatitude = position.coords.latitude;
  userLongitude = position.coords.longitude;

  console.log('Got location:', userLatitude, userLongitude);

  searchNearbyCoffeeShops(userLatitude, userLongitude);

  locateButton.innerHTML = successButtonContent;
  setTimeout(function () {
    locateButton.innerHTML = normalButtonContent;
  }, 2200);
}

// Runs if something goes wrong (user said no, timed out, etc.)
function handleLocationError(error) {
  console.log('Location error:', error.message);
  alert('Could not get your location. Please allow location access and try again.');
  locateButton.innerHTML = normalButtonContent;
}

locateButton.addEventListener('click', function () {
  locateButton.innerHTML = loadingButtonContent;
  navigator.geolocation.getCurrentPosition(handleLocationSuccess, handleLocationError);
});


/* =====================================================
   PART 1B: SVG radar — plotting found cafes around the
   user's center dot, and showing a popup with the cafe's
   name, distance, and a directions button when clicked.
   Positions are random, just kept inside the outer ring
   so dots never overlap the center pin or spill outside.
   ===================================================== */

const RADAR_CENTER_X = 200;
const RADAR_CENTER_Y = 200;
const RADAR_MIN_DISTANCE = 25;      // keeps dots off the user's own pin
const RADAR_MAX_DISTANCE = 175;     // keeps dots inside the outermost ring
const RADAR_SEARCH_RADIUS_KM = 3;   // matches the 3km radius used in the Overpass search

// Removes any cafe dots left over from a previous search
function clearRadarDots() {
  const radarDotsGroup = document.getElementById('radarDots');
  radarDotsGroup.innerHTML = '';
  removeRadarPopup();
}

// Creates one <circle> SVG element for a single cafe. The angle
// around the center is random, but the distance from center
// reflects the cafe's real distance from the user — closer
// cafes land nearer the middle, farther ones nearer the edge.
// Clicking the dot opens a popup with that cafe's real info.
function createRadarDot(cafe, randomDelaySeconds) {
  const randomAngle = Math.random() * Math.PI * 2; // 0 to 360 degrees, in radians

  const actualDistanceKm = calculateDistanceInKm(userLatitude, userLongitude, cafe.lat, cafe.lon);

  // Scale the real-world distance (0 to 3km) onto the radar's
  // distance range (RADAR_MIN_DISTANCE to RADAR_MAX_DISTANCE).
  // Clamp at 1 in case a result is right at the radius edge.
  const distanceRatio = Math.min(actualDistanceKm / RADAR_SEARCH_RADIUS_KM, 1);
  const radarDistance = RADAR_MIN_DISTANCE + distanceRatio * (RADAR_MAX_DISTANCE - RADAR_MIN_DISTANCE);

  const dotX = RADAR_CENTER_X + radarDistance * Math.cos(randomAngle);
  const dotY = RADAR_CENTER_Y + radarDistance * Math.sin(randomAngle);

  // SVG elements can't be made with document.createElement —
  // they need createElementNS with the SVG namespace.
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', dotX.toFixed(1));
  dot.setAttribute('cy', dotY.toFixed(1));
  dot.setAttribute('r', 6);
  dot.setAttribute('class', 'radar-cafe-dot');
  dot.style.animationDelay = randomDelaySeconds + 's';

  dot.addEventListener('click', function (event) {
    event.stopPropagation(); // don't let this bubble up and immediately close the popup
    showRadarPopup(cafe, dotX, dotY);
  });

  return dot;
}

// Takes the full list of cafes found and plots one dot per
// cafe onto the radar, replacing whatever was there before.
function renderRadarCafes(cafeList) {
  clearRadarDots();

  const radarDotsGroup = document.getElementById('radarDots');

  cafeList.forEach(function (cafe, index) {
    // Stagger the pop-in animation slightly so dots don't all
    // appear in one single flash.
    const staggerDelay = index * 0.05;
    const dot = createRadarDot(cafe, staggerDelay);
    radarDotsGroup.appendChild(dot);
  });
}

// Builds and shows the popup card for one cafe: name, distance,
// and a "Directions" button. dotX/dotY are the dot's position in
// the SVG's 400x400 coordinate space, which we convert to a
// percentage so the popup lines up with the dot at any screen size.
function showRadarPopup(cafe, dotX, dotY) {
  removeRadarPopup();

  const cafeName = cafe.tags.name || 'Unnamed Coffee Shop';
  const distanceKm = calculateDistanceInKm(userLatitude, userLongitude, cafe.lat, cafe.lon).toFixed(2);

  const leftPercent = (dotX / 400) * 100;
  const topPercent = (dotY / 400) * 100;

  const popup = document.createElement('div');
  popup.className = 'radar-popup';
  popup.id = 'radarPopup';
  popup.style.left = leftPercent + '%';
  popup.style.top = topPercent + '%';

  // Flip below the dot if it's too close to the top edge to fit above it
  if (topPercent < 30) {
    popup.classList.add('radar-popup-below');
  }

  // Nudge sideways if the dot is too close to the left/right edge
  if (leftPercent < 20) {
    popup.classList.add('radar-popup-align-left');
  } else if (leftPercent > 80) {
    popup.classList.add('radar-popup-align-right');
  }

  popup.innerHTML =
    '<button class="radar-popup-close" aria-label="Close">✕</button>' +
    '<div class="map-popup-name">' + cafeName + '</div>' +
    '<div class="map-popup-distance">' + distanceKm + ' km away</div>' +
    '<button class="map-popup-directions-button">Directions</button>';

  document.getElementById('radarPopupLayer').appendChild(popup);

  popup.querySelector('.radar-popup-close').addEventListener('click', function (event) {
    event.stopPropagation();
    removeRadarPopup();
  });

  popup.querySelector('.map-popup-directions-button').addEventListener('click', function (event) {
    event.stopPropagation();
    openDirectionsTo(cafe.lat, cafe.lon);
  });
}

function removeRadarPopup() {
  const existingPopup = document.getElementById('radarPopup');
  if (existingPopup !== null) {
    existingPopup.remove();
  }
}

// Opens real turn-by-turn directions in Google Maps, from the
// user's actual location to the actual cafe coordinates — the
// radar dot's position is illustrative, but this link is real.
function openDirectionsTo(destinationLat, destinationLon) {
  const directionsURL =
    'https://www.google.com/maps/dir/?api=1&origin=' + userLatitude + ',' + userLongitude +
    '&destination=' + destinationLat + ',' + destinationLon;
  window.open(directionsURL, '_blank');
}

// Clicking anywhere outside an open popup closes it
document.addEventListener('click', function () {
  removeRadarPopup();
});


/* =====================================================
   PART 2: Filter chip buttons ("All", "Open now", etc.)
   Clicking one highlights it AND hides any ticket card
   that doesn't match it.
   ===================================================== */

const filterButtons = document.querySelectorAll('.filter-chip');

// Decides: does this ONE card match the filter that was clicked?
function cardMatchesFilter(card, filterText) {
  // "All" always matches everything
  if (filterText === 'All') {
    return true;
  }

  // "Open now" is a special case — we just check for the green "open" tag
  if (filterText === 'Open now') {
    return card.querySelector('.tag-open') !== null;
  }

  // For every other filter (Wifi, Pet friendly, etc.), check
  // if any tag's text exactly matches the filter name
  const tagsInCard = card.querySelectorAll('.tag');
  let foundMatch = false;

  tagsInCard.forEach(function (tag) {
    if (tag.textContent.trim() === filterText) {
      foundMatch = true;
    }
  });

  return foundMatch;
}

// Goes through every card currently on the page and shows/hides it
// based on the filter. We look up the cards fresh each time this runs,
// since the real cafe cards get added to the page later than this
// file first loads.
function applyFilter(filterText) {
  const currentTicketCards = document.querySelectorAll('.ticket-card');

  currentTicketCards.forEach(function (card) {
    if (cardMatchesFilter(card, filterText)) {
      card.classList.remove('hide-card');
    } else {
      card.classList.add('hide-card');
    }
  });
}

filterButtons.forEach(function (button) {
  button.addEventListener('click', function () {
    // Highlight the clicked button, un-highlight the rest
    filterButtons.forEach(function (otherButton) {
      otherButton.classList.remove('filter-chip-active');
    });
    button.classList.add('filter-chip-active');

    // Actually filter the cards now
    applyFilter(button.textContent.trim());
  });
});


/* =====================================================
   PART 3: Mobile hamburger menu
   Opens a sidebar with a blurred background when the
   3-line icon is tapped on a small screen.
   ===================================================== */

// -----------------------------------------------------
// Copy the desktop nav links into the mobile menu
// automatically, so we only ever have to edit .nav-links
// in one place (the HTML) instead of keeping two lists
// in sync by hand.
// -----------------------------------------------------

const desktopNavLinks = document.querySelectorAll('.nav-links a'); // the real list
const mobileMenuLinksContainer = document.getElementById('mobileMenuLinks'); // the empty box we copy into

desktopNavLinks.forEach(function (link) {
  const linkCopy = link.cloneNode(true);
  mobileMenuLinksContainer.appendChild(linkCopy);
});

const hamburgerButton = document.getElementById('hamburgerButton');
const closeMenuButton = document.getElementById('mobileMenuCloseButton');
const menuPanel = document.getElementById('mobileMenuPanel');
const menuOverlay = document.getElementById('mobileMenuOverlay');

function openMobileMenu() {
  menuPanel.classList.add('is-open');
  menuOverlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
  menuPanel.classList.remove('is-open');
  menuOverlay.classList.remove('is-open');
  document.body.style.overflow = '';
}

hamburgerButton.addEventListener('click', openMobileMenu);
closeMenuButton.addEventListener('click', closeMobileMenu);
menuOverlay.addEventListener('click', closeMobileMenu);

const mobileMenuClickableItems = menuPanel.querySelectorAll('a, button');
mobileMenuClickableItems.forEach(function (item) {
  item.addEventListener('click', closeMobileMenu);
});

// If the mobile menu is open and the screen gets resized to desktop width,
// close it so the page doesn't stay "locked" and unable to scroll.
window.addEventListener('resize', function () {
  const isDesktopWidth = window.innerWidth > 800;
  const menuIsOpen = menuPanel.classList.contains('is-open');

  if (isDesktopWidth && menuIsOpen) {
    closeMobileMenu();
  }
});


/* =====================================================
   PART 5: Turn real cafe data into ticket cards on the page
   ===================================================== */

// Builds the HTML for ONE cafe card. Real map data is messy —
// not every cafe has a name or hours listed — so we fall back
// to sensible defaults instead of showing "undefined".
function buildTicketCardHTML(cafe) {
  const cafeName = cafe.tags.name || 'Unnamed Coffee Shop';

  const hoursText = cafe.tags.opening_hours
    ? '<span class="tag tag-open">' + cafe.tags.opening_hours + '</span>'
    : '';

  return `
    <div class="ticket-card">
      <div class="ticket-card-top">
        <div>
          <div class="ticket-card-name">${cafeName}</div>
          <div class="ticket-card-address">Near you</div>
        </div>
      </div>
      <div class="ticket-tags">
        ${hoursText}
      </div>
      <div class="ticket-card-bottom">
        <span>${calculateDistanceInKm(userLatitude, userLongitude, cafe.lat, cafe.lon).toFixed(2)} km away</span>
      </div>
    </div>
  `;
}

// Takes the full list of cafes and replaces whatever is in the
// ticket grid with real cards — one per cafe.
function displayCoffeeShops(cafeList) {
  const ticketGrid = document.getElementById('ticketGrid');

  if (cafeList.length === 0) {
    ticketGrid.innerHTML = '<p>No coffee shops found within 3km. Try again in a different area.</p>';
    return;
  }

  const allCardsHTML = cafeList.map(buildTicketCardHTML).join('');
  ticketGrid.innerHTML = allCardsHTML;
}


/* =====================================================
   PART 6: Calculate real distance between two coordinates
   Uses the Haversine formula — the standard way to measure
   distance between two points on a sphere (like Earth).
   ===================================================== */

function convertDegreesToRadians(degrees) {
  return degrees * (Math.PI / 180);
}

// Returns the distance in kilometers between two lat/lng points
function calculateDistanceInKm(lat1, lon1, lat2, lon2) {
  const earthRadiusKm = 6371; // Earth's average radius

  const latDifference = convertDegreesToRadians(lat2 - lat1);
  const lonDifference = convertDegreesToRadians(lon2 - lon1);

  const lat1Radians = convertDegreesToRadians(lat1);
  const lat2Radians = convertDegreesToRadians(lat2);

  // This part is the actual Haversine formula — a known, standard
  // piece of math. You don't need to memorize how it works internally,
  // just trust it and use it, like a library function.
  const a =
    Math.sin(latDifference / 2) * Math.sin(latDifference / 2) +
    Math.cos(lat1Radians) * Math.cos(lat2Radians) *
    Math.sin(lonDifference / 2) * Math.sin(lonDifference / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}


/* =====================================================
   PART 7: Show a real map with a pin for you and for
   every nearby cafe. Uses Leaflet + OpenStreetMap tiles —
   free, no API key needed.
   ===================================================== */

let mapInstance = null;     // holds the map itself, once created
let routingControl = null;  // holds the current "directions" route line, if any

// A custom icon for the user's own pin: a solid dot with a
// pulsing ring around it (built with plain CSS, see styles.css)
function createUserIcon() {
  return L.divIcon({
    className: '', // stops Leaflet from adding its own default pin styling
    html: '<div class="map-pin-user-wrapper">' +
            '<div class="map-pin-user-ring"></div>' +
            '<div class="map-pin-user-dot"></div>' +
          '</div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8] // centers the icon on its exact coordinate
  });
}

// A custom icon for a coffee shop pin: a small gold dot
function createCafeIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="map-pin-cafe"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

// Removes any currently-drawn route, so clicking a new
// "Show directions" button doesn't stack routes on top of each other
function clearDirections() {
  if (routingControl !== null) {
    mapInstance.removeControl(routingControl);
    routingControl = null;
  }
}

// Draws an actual route (along real roads) from the user to
// one destination point, using the free Leaflet Routing Machine plugin
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

// Creates one cafe marker, with a popup showing its name,
// distance, and a "Show directions" button
function createCafeMarker(cafe) {
  const cafeName = cafe.tags.name || 'Unnamed Coffee Shop';
  const distanceText = calculateDistanceInKm(userLatitude, userLongitude, cafe.lat, cafe.lon).toFixed(2);

  const marker = L.marker([cafe.lat, cafe.lon], { icon: createCafeIcon() }).addTo(mapInstance);

  const popupHTML =
    '<div class="map-popup-name">' + cafeName + '</div>' +
    '<div class="map-popup-distance">' + distanceText + ' km away</div>' +
    '<button class="map-popup-directions-button">Show directions</button>';

  marker.bindPopup(popupHTML);

  // The "Show directions" button doesn't exist on the page until
  // the popup is actually opened, so we can't attach a click
  // listener to it right away — we have to wait for the popup
  // to open first, then find the button INSIDE that specific popup.
  marker.on('popupopen', function (event) {
    const popupElement = event.popup.getElement();
    const directionsButton = popupElement.querySelector('.map-popup-directions-button');

    directionsButton.addEventListener('click', function () {
      showDirectionsTo(cafe.lat, cafe.lon);
    });
  });

  return marker;
}

function showRealMap(latitude, longitude, cafeList) {
  // If a map already exists (user clicked the button more than
  // once), remove the old one first so we don't stack duplicates
  if (mapInstance !== null) {
    mapInstance.remove();
    routingControl = null; // the old route was destroyed along with the old map
  }

  // Create the map, centered on the user, zoomed in fairly close.
  // 'realMap' must match the id of the empty <div> in index.html.
  mapInstance = L.map('realMap').setView([latitude, longitude], 15);

  // Add the visual map tiles. We're using CartoDB's free "dark"
  // tile set instead of the default light one, to match our
  // espresso color palette.
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO'
  }).addTo(mapInstance);

  // Drop the pulsing pin for the user's own location
  L.marker([latitude, longitude], { icon: createUserIcon() }).addTo(mapInstance)
    .bindPopup('You are here');

  // Drop a custom pin (with popup + directions button) for every cafe found
  cafeList.forEach(function (cafe) {
    createCafeMarker(cafe);
  });
}