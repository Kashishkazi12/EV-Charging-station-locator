// app.js (final)

// ---------------------------
// Firebase imports (modular)
// ---------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
  getDoc,
  deleteDoc,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// ---------------------------
// Firebase config & init
// ---------------------------
const firebaseConfig = {
  apiKey: "AIzaSyB2FuzvGI87DGGVxjFpXZ1X1igegHMFGlY",
  authDomain: "ev-charging-system-18255.firebaseapp.com",
  projectId: "ev-charging-system-18255",
  storageBucket: "ev-charging-system-18255.firebasestorage.app",
  messagingSenderId: "128058709073",
  appId: "1:128058709073:web:c47cf512c42d72b6e29470"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ---------------------------
// Small DOM helpers
// ---------------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------------------------
// Keep current user
// ---------------------------
let currentUser = null;
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  // You can update UI for login state here if needed
});

// ---------------------------
// DOM references
// ---------------------------
const cityGrid = $("#cityGrid");
const stationListPanel = $("#stationList");
const stationListTitle = $("#stationListTitle");
const stationsContainer = $("#stationsContainer");
const backBtn = $("#backBtn");

const bookingModal = $("#bookingModal");
const closeModalBtn = $("#closeModal");
const bookingFormModal = $("#bookingFormModal");

const paymentConfirm = $("#paymentConfirm");
const qrBox = $("#qrBox");
const paidBtn = $("#paidBtn");
const paymentFailedBtn = $("#paymentFailedBtn");

const searchBar = $("#searchBar");
const searchResults = $("#searchResults");

const statsValues = document.querySelectorAll(".stat-value");

// ---------------------------
// Utility: fetch all stations
// ---------------------------
async function fetchStations() {
  try {
    const snap = await getDocs(collection(db, "stations"));
    const stations = [];
    snap.forEach((s) => {
      const d = s.data();
      stations.push({
        id: s.id,
        name: d.Name || d.name || "Untitled",
        city: d.City || d.city || "Unknown",
        status: d.Status || d.status || "unknown"
      });
    });
    return stations;
  } catch (err) {
    console.error("fetchStations error:", err);
    return [];
  }
}

// ---------------------------
// Group stations by city
// ---------------------------
function groupByCity(stations) {
  const map = {};
  stations.forEach((s) => {
    const city = (s.city || "Unknown").trim();
    if (!map[city]) map[city] = [];
    map[city].push(s);
  });
  return map;
}

// ---------------------------
// Render city grid
// ---------------------------
function renderCities(cityMap) {
  if (!cityGrid) return;
  cityGrid.innerHTML = "";
  Object.keys(cityMap)
    .sort()
    .forEach((city) => {
      const card = document.createElement("div");
      card.className = "city-card";
      card.innerHTML = `
        <div class="city-name">${city}</div>
        <div class="city-meta">${cityMap[city].length} stations</div>
      `;
      card.addEventListener("click", () => openCity(city, cityMap[city]));
      cityGrid.appendChild(card);
    });
}

// ---------------------------
// Open city -> show stations
// ---------------------------
function openCity(city, stations) {
  if (!stationListPanel || !stationsContainer) return;
  stationListTitle.textContent = `${city} EV Available Stations`;
  stationsContainer.innerHTML = "";
  stations.forEach((s, i) => {
    const div = document.createElement("div");
    div.className = "station";
    div.dataset.stationId = s.id;
    div.innerHTML = `
      <h4>${s.name}</h4>
      <p>Status: <strong>${s.status}</strong></p>
      <div style="display:flex; gap:8px; justify-content:center; margin-top:10px;">
        <button class="book-btn" data-id="${s.id}">Book Slot</button>
        <button class="cancel-btn" data-id="${s.id}" style="display:none;">Cancel</button>
      </div>
    `;
    stationsContainer.appendChild(div);
    setTimeout(() => div.classList.add("show"), i * 100);
  });

  if (cityGrid) cityGrid.style.display = "none";
  stationListPanel.classList.add("open");
  stationListPanel.scrollIntoView({ behavior: "smooth" });

  attachBookingHandlers();
}

// ---------------------------
// Initialize cities on load
// ---------------------------
(async function init() {
  const stations = await fetchStations();
  const cityMap = groupByCity(stations);
  renderCities(cityMap);
  await refreshStats(); // populate stats on load
})();

// ---------------------------
// Back button from station list
// ---------------------------
if (backBtn) {
  backBtn.addEventListener("click", () => {
    stationListPanel.classList.remove("open");
    if (cityGrid) cityGrid.style.display = "grid";
    window.scrollTo({ top: cityGrid ? cityGrid.offsetTop - 50 : 0, behavior: "smooth" });
  });
}

// ---------------------------
// Attach booking & cancel handlers
// ---------------------------
function attachBookingHandlers() {
  const bookBtns = $$(".book-btn");
  const cancelBtns = $$(".cancel-btn");

  bookBtns.forEach((btn) => {
    if (btn._attached) return;
    btn._attached = true;
    btn.addEventListener("click", () => {
      const stationId = btn.dataset.id;
      const hidden = document.getElementById("stationIdInput");
      if (hidden) hidden.value = stationId;
      if (bookingModal) bookingModal.style.display = "flex";
    });
  });

  cancelBtns.forEach((btn) => {
    if (btn._attached) return;
    btn._attached = true;
    btn.addEventListener("click", async () => {
      if (!currentUser) {
        alert("Please login to cancel booking.");
        return;
      }
      const stationId = btn.dataset.id;
      try {
        // find active booking(s) for this user+station
        const allBookingsSnap = await getDocs(collection(db, "bookings"));
        let found = false;
        for (const bs of allBookingsSnap.docs) {
          const b = bs.data();
          if (b.userId === currentUser.uid && b.stationId === stationId && b.status === "active") {
            await updateDoc(doc(db, "bookings", bs.id), { status: "cancelled", cancelledAt: serverTimestamp() });
            found = true;
          }
        }
        if (found) {
          alert("Booking cancelled.");
          btn.style.display = "none";
          const bookBtn = btn.previousElementSibling;
          if (bookBtn) bookBtn.style.display = "inline-block";
          await refreshStats(); // update bookings count
        } else {
          alert("No active booking found to cancel.");
        }
      } catch (err) {
        console.error("Cancel booking error:", err);
        alert("Error cancelling booking: " + err.message);
      }
    });
  });
}

// ---------------------------
// Booking modal handlers
// ---------------------------
if (bookingModal && bookingFormModal && closeModalBtn) {
  closeModalBtn.onclick = () => (bookingModal.style.display = "none");
  window.onclick = (e) => {
    if (e.target === bookingModal) bookingModal.style.display = "none";
  };

  bookingFormModal.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) {
      alert("Please login before booking.");
      return;
    }

    // Read form values
    const name = (document.getElementById("userName") || {}).value || "Anonymous";
    const phone = (document.getElementById("userPhone") || {}).value || "";
    const date = (document.getElementById("dateSlot") || {}).value || "";
    const time = (document.getElementById("timeSlot") || {}).value || "";
    const duration = Number((document.getElementById("duration") || {}).value) || 60;
    const paymentMethod = (document.getElementById("paymentMethod") || {}).value || "UPI";
    const stationId = (document.getElementById("stationIdInput") || {}).value;

    if (!stationId || !date || !time || !phone) {
      alert("Please fill required fields.");
      return;
    }

    // Demo amount calc
    const amount = Math.max(20, Math.ceil(duration / 30) * 50);

    // UPI intent/QR
    const upiReceiver = "merchant@upi"; // demo placeholder
    const upiNote = encodeURIComponent(`EV Charging - ${stationId} ${date} ${time}`);
    const upiUrl = `upi://pay?pa=${encodeURIComponent(upiReceiver)}&pn=${encodeURIComponent("EV Spot")}&am=${encodeURIComponent(amount)}&cu=INR&tn=${upiNote}`;

    // Show payment overlay and QR
    if (paymentConfirm) paymentConfirm.style.display = "flex";
    if (qrBox) qrBox.innerHTML = `<img src="https://chart.googleapis.com/chart?cht=qr&chs=260x260&chl=${encodeURIComponent(upiUrl)}" alt="UPI QR" />`;

    // If mobile, attempt intent
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    if (isMobile) {
      try { window.location.href = upiUrl; } catch (err) { console.warn("UPI intent failed", err); }
    }

    // handlers for paid / failed
    const onPaid = async () => {
      paidBtn.disabled = true;
      paymentFailedBtn.disabled = true;
      if (paymentConfirm) paymentConfirm.style.display = "none";

      const bookingData = {
        userId: currentUser.uid,
        name,
        phone,
        stationId,
        date,
        time,
        duration,
        paymentMethod,
        paymentAmount: amount,
        paymentStatus: "success",
        status: "active",
        timestamp: serverTimestamp()
      };

      try {
        await addDoc(collection(db, "bookings"), bookingData);
        alert("✅ Booking confirmed!");
        bookingFormModal.reset();
        bookingModal.style.display = "none";
        await refreshStats();
      } catch (err) {
        console.error("Save booking error:", err);
        alert("Error saving booking: " + err.message);
      } finally {
        paidBtn.removeEventListener("click", onPaid);
        paymentFailedBtn.removeEventListener("click", onFailed);
        paidBtn.disabled = false;
        paymentFailedBtn.disabled = false;
      }
    };

    const onFailed = () => {
      if (paymentConfirm) paymentConfirm.style.display = "none";
      alert("Payment not completed — booking not saved.");
      paidBtn.removeEventListener("click", onPaid);
      paymentFailedBtn.removeEventListener("click", onFailed);
    };

    paidBtn.addEventListener("click", onPaid);
    paymentFailedBtn.addEventListener("click", onFailed);
  });
}

// ---------------------------
// Admin: show stations & bookings if panels exist
// ---------------------------
const adminStationList = $("#admin-station-list");
if (adminStationList) {
  (async function showStations() {
    try {
      const snap = await getDocs(collection(db, "stations"));
      adminStationList.innerHTML = "";
      snap.forEach((s) => {
        const d = s.data();
        const div = document.createElement("div");
        div.innerHTML = `
          <strong>${d.name || d.Name || "Untitled"}</strong> - Status: <span id="status-${s.id}">${d.status || d.Status || "unknown"}</span>
          <button onclick="toggleStatus('${s.id}', '${d.status || d.Status || "unknown"}')">Toggle</button>
          <br><br>
        `;
        adminStationList.appendChild(div);
      });
    } catch (err) {
      console.error("Admin stations error:", err);
    }
  })();
}

window.toggleStatus = async function (stationId, currentStatus) {
  try {
    const newStatus = currentStatus === "online" ? "offline" : "online";
    await updateDoc(doc(db, "stations", stationId), { status: newStatus });
    alert(`Status changed to ${newStatus}`);
    location.reload();
  } catch (err) {
    console.error("toggleStatus error:", err);
    alert("Error toggling status: " + err.message);
  }
};

const adminBookingList = $("#admin-booking-list");
if (adminBookingList) {
  (async function showBookings() {
    try {
      const snaps = await getDocs(query(collection(db, "bookings"), orderBy("timestamp", "desc")));
      adminBookingList.innerHTML = "";
      for (const bs of snaps.docs) {
        const b = bs.data();
        const stationRef = doc(db, "stations", b.stationId);
        const stationSnap = await getDoc(stationRef);
        const stationName = stationSnap.exists() ? stationSnap.data().name || stationSnap.data().Name : "Unknown Station";
        const div = document.createElement("div");
        div.innerHTML = `
          📍 <strong>Station:</strong> ${stationName}<br>
          👤 <strong>User:</strong> ${b.name || b.userId} (${b.phone || "-"})<br>
          📅 <strong>Date:</strong> ${b.date || "-"}<br>
          ⏰ <strong>Time:</strong> ${b.time || "-"}<br>
          ⏳ <strong>Duration:</strong> ${b.duration || "-"} mins<br>
          💳 <strong>Payment:</strong> ${b.paymentStatus || "-"} via ${b.paymentMethod || "-"}<br>
          🔖 <strong>Status:</strong> ${b.status || "-"}<br>
          <button onclick="deleteBooking('${bs.id}')">Delete</button>
          <hr>
        `;
        adminBookingList.appendChild(div);
      }
    } catch (err) {
      console.error("Admin bookings error:", err);
    }
  })();
}

window.deleteBooking = async function (bookingId) {
  const ok = confirm("Delete booking permanently?");
  if (!ok) return;
  try {
    await deleteDoc(doc(db, "bookings", bookingId));
    alert("Booking deleted.");
    location.reload();
  } catch (err) {
    console.error("deleteBooking error:", err);
    alert("Error deleting booking: " + err.message);
  }
};

// ---------------------------
// SEARCH: show results under input
// ---------------------------
if (searchBar) {
  // ensure searchResults container exists (index.html already has one but just in case)
  let resultsContainer = $("#searchResults");
  if (!resultsContainer) {
    const el = document.createElement("div");
    el.id = "searchResults";
    searchBar.insertAdjacentElement("afterend", el);
    resultsContainer = el;
  }

  let lastStationsCache = null;

  searchBar.addEventListener("input", async (e) => {
    const q = e.target.value.trim().toLowerCase();
    resultsContainer.innerHTML = "";
    if (!q) return;

    // fetch stations if not cached
    if (!lastStationsCache) lastStationsCache = await fetchStations();
    const matched = lastStationsCache.filter((s) => {
      return (s.name && s.name.toLowerCase().includes(q)) || (s.city && s.city.toLowerCase().includes(q));
    });

    if (!matched.length) {
      resultsContainer.innerHTML = `<p style="color:#777;">No stations found for "${q}"</p>`;
      return;
    }

    matched.forEach((s) => {
      const card = document.createElement("div");
      card.className = "search-result-card";
      card.innerHTML = `
        <h4>${s.name}</h4>
        <p><strong>City:</strong> ${s.city}</p>
        <p><strong>Status:</strong> ${s.status}</p>
        <div style="text-align:center; margin-top:10px;"><button class="book-btn" data-id="${s.id}">Book Slot</button></div>
      `;
      resultsContainer.appendChild(card);
    });

    attachBookingHandlers();
  });
}

// ---------------------------
// Stats: read counts from Firestore and animate
// ---------------------------
async function refreshStats() {
  try {
    // active stations (count of stations with status 'online' or total)
    const stationsSnap = await getDocs(collection(db, "stations"));
    const stations = [];
    const citiesSet = new Set();
    stationsSnap.forEach((s) => {
      const d = s.data();
      stations.push(d);
      const city = (d.City || d.city || "Unknown").trim();
      if (city) citiesSet.add(city);
    });
    const activeStations = stations.filter((s) => (s.Status || s.status || "").toLowerCase() === "online").length || stations.length;
    const citiesConnected = citiesSet.size;

    // total bookings
    const bookingsSnap = await getDocs(collection(db, "bookings"));
    const totalBookings = bookingsSnap.size || 0;

    // write into DOM with animation
    const statEls = document.querySelectorAll(".stat-value");
    statEls.forEach((el) => {
      const label = el.parentElement.querySelector("p")?.textContent?.toLowerCase() || "";
      if (label.includes("active")) animateCountUp(el, activeStations);
      else if (label.includes("total")) animateCountUp(el, totalBookings);
      else if (label.includes("cities")) animateCountUp(el, citiesConnected);
    });
  } catch (err) {
    console.error("refreshStats error:", err);
  }
}

// small count-up helper
function animateCountUp(el, target = 0, duration = 1000) {
  const start = 0;
  const range = target - start;
  const startTime = performance.now();
  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 2); // easeOutQuad
    const value = Math.round(start + range * eased);
    el.textContent = value;
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target;
  }
  requestAnimationFrame(step);
}

// ---------------------------
// IntersectionObserver to reveal sections (cool animations)
// ---------------------------
(function setupObservers() {
  const revealSelector = [".popular-cities", ".stats-section", ".stations"];
  const opts = { root: null, rootMargin: "0px 0px -10% 0px", threshold: 0.12 };
  const obs = new IntersectionObserver((entries, o) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("show");
      if (entry.target.classList.contains("stats-section")) refreshStats();
      o.unobserve(entry.target);
    });
  }, opts);

  revealSelector.forEach((sel) => {
    const node = document.querySelector(sel);
    if (node) obs.observe(node);
  });

  // reveal city slides if cityGrid exists
  const cityGridNode = $("#cityGrid");
  if (cityGridNode) {
    // show children after a small delay
    setTimeout(() => {
      cityGridNode.childNodes.forEach((c, i) => setTimeout(() => c.classList && c.classList.add("visible"), i * 80));
    }, 600);
  }
})();

// ---------------------------
// Utility: Expose reloadCities to window for manual refresh (dev)
// ---------------------------
window.reloadCities = async function () {
  const stations = await fetchStations();
  const cityMap = groupByCity(stations);
  renderCities(cityMap);
  await refreshStats();
};
