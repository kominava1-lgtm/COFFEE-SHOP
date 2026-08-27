// Get your own free key at geoapify.com — this one is a placeholder.
const GEOAPIFY_API_KEY = '3de55e6482c54ff483043085bc107b15';

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
  '</svg> Located';


function searchNearbyCoffeeShops(latitude, longitude) {
  const radiusInMeters = 3000; // 3km, matches our requirement

  // Geoapify's Places API: ask for cafes/coffee shops within a circle
  // (center point + radius), using our free API key.
  const geoapifyURL =
    'https://api.geoapify.com/v2/places' +
    '?categories=catering.cafe' +
    '&filter=circle:' + longitude + ',' + latitude + ',' + radiusInMeters +
    '&bias=proximity:' + longitude + ',' + latitude +
    '&limit=50' +
    '&apiKey=' + GEOAPIFY_API_KEY;

  fetch(geoapifyURL)
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      const coffeeShops = convertGeoapifyResultsToCafeShape(data.features);

      console.log('Found ' + coffeeShops.length + ' coffee shops:', coffeeShops);

      loadVisitedPinsInRange(latitude, longitude, radiusInMeters / 1000).then(function (visitedPins) {
        const allCafes = coffeeShops.concat(visitedPins);
        displayCoffeeShops(allCafes);
        renderRadarCafes(allCafes);

        document.getElementById('cafeCountStat').textContent = allCafes.length;

        // Save this search so it can be restored if the user leaves
        // this page (e.g. to view the map) and comes back.
        localStorage.setItem('espressoXpressMapData', JSON.stringify({
          lat: latitude,
          lon: longitude,
          cafes: allCafes
        }));
      });
    })
    .catch(function (error) {
      console.log('Geoapify search failed:', error);
    });
}

// Fetches every pin saved in Supabase, keeps only the ones within
// the given radius of the search location, and reshapes each one
// to look like a normal cafe object — { tags: { name }, lat, lon } —
// so it can be plotted using the exact same radar-dot code.
// Also tags each one with isVisited = true, so we can style it
// differently (see createRadarDot).
function loadVisitedPinsInRange(latitude, longitude, radiusKm) {
  return supabaseClient
    .from('visited_cafes')
    .select('*')
    .then(function (result) {
      if (result.error) {
        console.log('Could not load visited pins for radar:', result.error.message);
        return [];
      }

      return result.data
        .filter(function (pin) {
          const distance = calculateDistanceInKm(latitude, longitude, pin.lat, pin.lon);
          return distance <= radiusKm;
        })
        .map(function (pin) {
          return {
            tags: { name: pin.cafe_name || 'Unnamed pin' },
            lat: pin.lat,
            lon: pin.lon,
            isVisited: true
          };
        });
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

// Geoapify returns results in GeoJSON format, which looks very
// different from Overpass's shape. This converts each Geoapify
// result into the same { tags: {...}, lat, lon } shape the rest
// of the app already expects — so nothing else needs to change.
function convertGeoapifyResultsToCafeShape(features) {
  return features.map(function (feature) {
    const properties = feature.properties;

    return {
      lat: properties.lat,
      lon: properties.lon,
      tags: {
        name: properties.name,
        opening_hours: properties.opening_hours || null,
        phone: properties.contact ? properties.contact.phone : null,
        website: properties.website || null
      }
    };
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
   PART 1C: Typed address search
   Turns whatever text the user types into coordinates
   (using Nominatim, OpenStreetMap's free geocoder — same
   ecosystem as the Overpass cafe data), then runs the same
   nearby-cafe search used by "Use my location".
   ===================================================== */

const addressInput = document.getElementById('addressInput');
const searchAddressButton = document.getElementById('searchAddressButton');
const defaultAddressPlaceholder = addressInput.placeholder;

// Turns a typed address into { latitude, longitude } using Nominatim.
// Returns null if nothing matched.
function geocodeAddress(address) {
  const geocodeURL =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(address);

  return fetch(geocodeURL)
    .then(function (response) {
      return response.json();
    })
    .then(function (results) {
      if (results.length === 0) {
        return null;
      }
      return {
        latitude: parseFloat(results[0].lat),
        longitude: parseFloat(results[0].lon)
      };
    });
}

// Runs when the user submits whatever they typed in the address box
function handleAddressSearch() {
  const typedAddress = addressInput.value.trim();

  if (typedAddress === '') {
    return; // nothing typed, nothing to search for
  }

  addressInput.disabled = true;
  addressInput.placeholder = 'Searching…';
  searchAddressButton.disabled = true;

  geocodeAddress(typedAddress)
    .then(function (location) {
      if (location === null) {
        alert('Could not find that address. Try a more specific one, like "City, Country".');
        return;
      }

      // From here on, treat the typed address just like a GPS location —
      // the same variables and search function power both paths.
      userLatitude = location.latitude;
      userLongitude = location.longitude;

      console.log('Geocoded address to:', userLatitude, userLongitude);

      searchNearbyCoffeeShops(userLatitude, userLongitude);
    })
    .catch(function (error) {
      console.log('Geocoding failed:', error);
      alert('Something went wrong searching for that address. Please try again.');
    })
    .finally(function () {
      addressInput.disabled = false;
      addressInput.placeholder = defaultAddressPlaceholder;
      searchAddressButton.disabled = false;
    });
}

// Pressing Enter while typing in the address box triggers the search
addressInput.addEventListener('keydown', function (event) {
  if (event.key === 'Enter') {
    handleAddressSearch();
  }
});

// Clicking the Search button does the same thing as pressing Enter
searchAddressButton.addEventListener('click', handleAddressSearch);


/* =====================================================
   PART 1B: SVG radar — plotting found cafes around the
   user's center dot, and showing a popup with the cafe's
   name, distance, and a directions button when clicked.
   Distance from center reflects real distance from the
   user; angle is randomized but nudged to avoid dots
   landing on top of each other (which would make them
   unclickable).
   ===================================================== */

const RADAR_CENTER_X = 200;
const RADAR_CENTER_Y = 200;
const RADAR_MIN_DISTANCE = 25;       // keeps dots off the user's own pin
const RADAR_INNER_RING = 80;         // matches the inner <circle> in index.html — represents 1km
const RADAR_OUTER_RING = 140;        // matches the outer <circle> in index.html — represents 2km
const RADAR_MAX_DISTANCE = 190;      // keeps dots inside the outermost ring's visible area (slightly less than 180, so dots at 3km don't sit ON the ring line)
const RADAR_SEARCH_RADIUS_KM = 3;    // matches the 3km radius used in the search
const RADAR_DOT_RADIUS = 8;         // visual size of each cafe dot
const RADAR_MIN_DOT_GAP = RADAR_DOT_RADIUS * 2 + 4; // minimum center-to-center distance allowed between two dots

// Removes any cafe dots left over from a previous search
function clearRadarDots() {
  const radarDotsGroup = document.getElementById('radarDots');
  radarDotsGroup.innerHTML = '';
  removeRadarPopup();
}

// Straight-line distance between two points in the SVG's own
// coordinate space (not real-world km — just used to check overlap).
function distanceBetweenPoints(x1, y1, x2, y2) {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

// Picks an angle (in radians) for this cafe's dot that keeps it
// at least RADAR_MIN_DOT_GAP away from every already-placed dot,
// while staying at the same radarDistance from center (so the
// "closer cafes are nearer the middle" rule is never broken —
// only the angle moves to resolve overlaps, not the distance).
function findNonOverlappingAngle(radarDistance, placedPositions) {
  const maxRandomAttempts = 60;

  // First, try random angles — cheap, and works almost all the time
  // since the radar isn't usually packed with dots.
  for (let attempt = 0; attempt < maxRandomAttempts; attempt++) {
    const candidateAngle = Math.random() * Math.PI * 2;
    const candidateX = RADAR_CENTER_X + radarDistance * Math.cos(candidateAngle);
    const candidateY = RADAR_CENTER_Y + radarDistance * Math.sin(candidateAngle);

    const overlapsAnyExistingDot = placedPositions.some(function (position) {
      return distanceBetweenPoints(candidateX, candidateY, position.x, position.y) < RADAR_MIN_DOT_GAP;
    });

    if (!overlapsAnyExistingDot) {
      return candidateAngle;
    }
  }

  // Fallback for a crowded radar: sweep angles in fixed steps and
  // keep whichever one puts the most distance between this dot
  // and its closest neighbor — not a perfect gap, but the least bad option.
  let bestAngle = Math.random() * Math.PI * 2;
  let bestMinimumGap = -Infinity;
  const angleStepCount = 72; // every 5 degrees

  for (let step = 0; step < angleStepCount; step++) {
    const candidateAngle = (step / angleStepCount) * Math.PI * 2;
    const candidateX = RADAR_CENTER_X + radarDistance * Math.cos(candidateAngle);
    const candidateY = RADAR_CENTER_Y + radarDistance * Math.sin(candidateAngle);

    let closestGapFound = Infinity;
    placedPositions.forEach(function (position) {
      const gap = distanceBetweenPoints(candidateX, candidateY, position.x, position.y);
      if (gap < closestGapFound) {
        closestGapFound = gap;
      }
    });

    if (closestGapFound > bestMinimumGap) {
      bestMinimumGap = closestGapFound;
      bestAngle = candidateAngle;
    }
  }

  return bestAngle;
}

// Creates one <circle> SVG element for a single cafe at an
// already-decided x/y position. Clicking it opens a popup
// with that cafe's real info.
function createRadarDot(cafe, dotX, dotY, randomDelaySeconds) {
  // SVG elements can't be made with document.createElement —
  // they need createElementNS with the SVG namespace.
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', dotX.toFixed(1));
  dot.setAttribute('cy', dotY.toFixed(1));
  dot.setAttribute('r', RADAR_DOT_RADIUS);
  dot.setAttribute('class', cafe.isVisited ? 'radar-cafe-dot radar-cafe-dot-visited' : 'radar-cafe-dot');
  dot.style.animationDelay = randomDelaySeconds + 's';

  dot.addEventListener('click', function (event) {
    event.stopPropagation(); // don't let this bubble up and immediately close the popup
    showRadarPopup(cafe, dotX, dotY);
  });

  return dot;
}


// Turns a real-world distance (in km) into a position on the radar,
// using three connected bands instead of one smooth scale — so a
// cafe's dot always lands inside the ring that matches its true
// distance (under 1km, 1-2km, or 2-3km), while still shifting a
// little within that band based on its exact distance.
function calculateRadarDistance(actualDistanceKm) {
  if (actualDistanceKm <= 1) {
    // 0km -> 1km maps onto: center-safe-zone -> inner ring
    const ratio = actualDistanceKm / 1;
    return RADAR_MIN_DISTANCE + ratio * (RADAR_INNER_RING - RADAR_MIN_DISTANCE);
  }

  if (actualDistanceKm <= 2) {
    // 1km -> 2km maps onto: inner ring -> outer ring
    const ratio = (actualDistanceKm - 1) / 1;
    return RADAR_INNER_RING + ratio * (RADAR_OUTER_RING - RADAR_INNER_RING);
  }

  // 2km -> 3km (clamped) maps onto: outer ring -> radar edge
  const ratio = Math.min((actualDistanceKm - 2) / 1, 1);
  return RADAR_OUTER_RING + ratio * (RADAR_MAX_DISTANCE - RADAR_OUTER_RING);
}

// Takes the full list of cafes found and plots one dot per
// cafe onto the radar, replacing whatever was there before.
// Each dot's distance from center is based on the cafe's real
// distance from the user; the angle is chosen to avoid overlapping
// any dot already placed.
function renderRadarCafes(cafeList) {
  clearRadarDots();

  const radarDotsGroup = document.getElementById('radarDots');
  const placedPositions = []; // { x, y } for every dot placed so far, used for overlap checks

  cafeList.forEach(function (cafe, index) {
    const actualDistanceKm = calculateDistanceInKm(userLatitude, userLongitude, cafe.lat, cafe.lon);
    const radarDistance = calculateRadarDistance(actualDistanceKm);

    const chosenAngle = findNonOverlappingAngle(radarDistance, placedPositions);
    const dotX = RADAR_CENTER_X + radarDistance * Math.cos(chosenAngle);
    const dotY = RADAR_CENTER_Y + radarDistance * Math.sin(chosenAngle);

    placedPositions.push({ x: dotX, y: dotY });

    // Stagger the pop-in animation slightly so dots don't all
    // appear in one single flash.
    const staggerDelay = index * 0.05;
    const dot = createRadarDot(cafe, dotX, dotY, staggerDelay);
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
    '<button class="map-popup-view-page-button">View cafe page</button>' +
    '<button class="map-popup-directions-button">Directions</button>';

  document.getElementById('radarPopupLayer').appendChild(popup);

  popup.querySelector('.radar-popup-close').addEventListener('click', function (event) {
    event.stopPropagation();
    removeRadarPopup();
  });

  popup.querySelector('.map-popup-view-page-button').addEventListener('click', function (event) {
    event.stopPropagation();
    removeRadarPopup();
    openCafeDetail(cafe);
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
function buildTicketCardHTML(cafe, index) {
  const cafeName = cafe.tags.name || 'Unnamed Coffee Shop';

  const hoursText = cafe.tags.opening_hours
    ? '<span class="tag tag-open">' + cafe.tags.opening_hours + '</span>'
    : '';

  return `
    <div class="ticket-card" data-cafe-index="${index}">
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

// Remembers the cafes currently shown, so when someone clicks a
// ticket card, we can look up the full cafe data by its index.
let currentCafeList = [];

// Takes the full list of cafes and replaces whatever is in the
// ticket grid with real cards — one per cafe.
function displayCoffeeShops(cafeList) {
  const ticketGrid = document.getElementById('ticketGrid');

  if (cafeList.length === 0) {
    ticketGrid.innerHTML = '<p>No coffee shops found within 3km. Try again in a different area.</p>';
    return;
  }

  currentCafeList = cafeList;

  const allCardsHTML = cafeList
    .map(function (cafe, index) {
      return buildTicketCardHTML(cafe, index);
    })
    .join('');

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
   PART 8: Cafe detail panel — opens when a ticket card
   or a radar/map popup's "View cafe page" is clicked
   ===================================================== */

const cafeDetailOverlay = document.getElementById('cafeDetailOverlay');
const cafeDetailPanel = document.getElementById('cafeDetailPanel');
const cafeDetailCloseButton = document.getElementById('cafeDetailCloseButton');
const cafeDetailContent = document.getElementById('cafeDetailContent');

function openCafeDetail(cafe) {
  renderCafeDetail(cafe);
  cafeDetailOverlay.classList.add('is-open');
  cafeDetailPanel.classList.add('is-open');
}

function closeCafeDetail() {
  cafeDetailOverlay.classList.remove('is-open');
  cafeDetailPanel.classList.remove('is-open');
}

cafeDetailCloseButton.addEventListener('click', closeCafeDetail);
cafeDetailOverlay.addEventListener('click', closeCafeDetail);

function renderCafeDetail(cafe) {
  const cafeName = cafe.tags.name || 'Unnamed Coffee Shop';
  const distanceKm = calculateDistanceInKm(userLatitude, userLongitude, cafe.lat, cafe.lon).toFixed(2);
  const hoursText = cafe.tags.opening_hours || 'Not listed';
  const phoneText = cafe.tags.phone || cafe.tags['contact:phone'] || null;
  const websiteText = cafe.tags.website || cafe.tags['contact:website'] || null;

  cafeDetailContent.innerHTML =
    '<div class="cafe-detail-photo"></div>' +
    '<div class="cafe-detail-body">' +
      '<div class="cafe-detail-name">' + cafeName + '</div>' +
      '<div class="cafe-detail-address">' + distanceKm + ' km away</div>' +

      '<div class="cafe-detail-row"><span>Hours</span><span>' + hoursText + '</span></div>' +

      (phoneText ? '<div class="cafe-detail-row"><span>Phone</span><span>' + phoneText + '</span></div>' : '') +
      (websiteText ? '<div class="cafe-detail-row"><span>Website</span><span>' + websiteText + '</span></div>' : '') +

      '<button class="button-rust cafe-detail-directions-button" id="cafeDetailDirectionsButton">Get directions</button>' +
    '</div>';

  document.getElementById('cafeDetailDirectionsButton').addEventListener('click', function () {
    openDirectionsTo(cafe.lat, cafe.lon);
  });
}

// One click listener on the whole grid, instead of one per card —
// this way it still works even after cards get replaced by a new search.
document.getElementById('ticketGrid').addEventListener('click', function (event) {
  const clickedCard = event.target.closest('.ticket-card');
  if (clickedCard === null) {
    return;
  }

  const cafeIndex = Number(clickedCard.dataset.cafeIndex);
  const cafe = currentCafeList[cafeIndex];
  openCafeDetail(cafe);
});


/* =====================================================
   PART 9: "Open map" — sends the current search results
   to map.html, which shows the real interactive map.
   Since navigating to a new page wipes out all our
   JavaScript variables, we save what the map page needs
   into localStorage first, and map.js reads it back out.
   ===================================================== */

function goToMapPage() {
  // Only save search data if the user actually searched for something.
  // If they haven't, we just skip this — map.html knows how to handle
  // having no saved data.
  if (userLatitude !== null && userLongitude !== null) {
    const mapPageData = {
      lat: userLatitude,
      lon: userLongitude,
      cafes: currentCafeList
    };

    localStorage.setItem('espressoXpressMapData', JSON.stringify(mapPageData));
  }

  window.location.href = 'map.html';
}

document.getElementById('openMapButton').addEventListener('click', goToMapPage);
document.getElementById('openMapButtonMobile').addEventListener('click', goToMapPage);



/* =====================================================
   PART 11: Restore the last search — but only if we got
   here by navigating (e.g. "Back to search" from the map
   page), not from a manual page refresh.
   ===================================================== */

// The browser records exactly how the current page was loaded.
// "reload" = the user hit refresh; "navigate" = they arrived via
// a link or a script (like map.js sending them back here);
// "back_forward" = they used the browser's own Back/Forward buttons.
const navigationEntries = performance.getEntriesByType('navigation');
const navigationType = navigationEntries.length > 0 ? navigationEntries[0].type : 'navigate';

if (navigationType === 'reload') {
  // A real refresh — start fresh, like a brand new visit.
  localStorage.removeItem('espressoXpressMapData');
} else {
  const savedHomeDataText = localStorage.getItem('espressoXpressMapData');

  if (savedHomeDataText !== null) {
    const savedHomeData = JSON.parse(savedHomeDataText);

    userLatitude = savedHomeData.lat;
    userLongitude = savedHomeData.lon;

    displayCoffeeShops(savedHomeData.cafes);
    renderRadarCafes(savedHomeData.cafes);
    document.getElementById('cafeCountStat').textContent = savedHomeData.cafes.length;

    locateButton.innerHTML = successButtonContent;
  }
}


