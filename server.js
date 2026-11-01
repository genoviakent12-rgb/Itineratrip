// gets the api key from the env file
require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const BUDGET_TYPES = {
  1: "Economy",
  2: "Moderate",
  3: "Luxury",
};

const ALLOWED_PEOPLE = ["1", "2", "3", "4", "5", "6", "7", "8+"];
// will only read json files up to 20kb
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "itineratrip")));

function parseDate(value) {
  // dates must use YYYY-MM-DD format and be real calendar dates.
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(value + "T00:00:00.000Z");
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return date;
}
function getDuration(from, to) {
  const startDate = parseDate(from);
  const endDate = parseDate(to);
  const nights = Math.round((endDate - startDate) / 86400000);
  const days = nights + 1;

  return {
    days,
    nights,
    label: `${days} Day${days === 1 ? "" : "s"}, ${nights} Night${nights === 1 ? "" : "s"}`,
  };
}
function buildPrompt(trip) {
  const duration = getDuration(trip.from, trip.to);
  const travelerCount = trip.people === "8+" ? "8 or more" : trip.people;
  const budgetName = BUDGET_TYPES[trip.budget];
  const location = trip.locationInfo;

  return `
Create a personalized travel plan for this destination.

DESTINATION
Name: ${location.name}
Address: ${location.formattedAddress}
Google Place ID: ${location.placeId || "Not provided"}
Latitude: ${location.coordinates.latitude}
Longitude: ${location.coordinates.longitude}

TRIP DETAILS
Start date: ${trip.from}
End date: ${trip.to}
Duration: ${duration.label}
Travelers: ${travelerCount}
Budget: ${budgetName}
Preferred starting time: ${trip.time || "Flexible"}

Return only valid JSON, with no Markdown. Use this structure:
{
  "travelPlan": {
    "location": "destination name",
    "duration": "${duration.label}",
    "travelers": "${travelerCount}",
    "budgetType": "${budgetName}",
    "overview": "short summary",
    "estimatedTotalCost": "estimate and currency, or unknown",
    "flightDetails": {
      "route": "departure airport required",
      "airline": "not specified",
      "estimatedPrice": "not available",
      "bookingUrl": "",
      "flightClass": "Economy"
    },
    "hotels": [
      {
        "hotelName": "hotel name",
        "address": "hotel address",
        "price": "estimated price per night",
        "bookingUrl": "",
        "geoCoordinates": {
          "latitude": null,
          "longitude": null
        },
        "rating": null,
        "description": "hotel description"
      }
    ],
    "itinerary": {
      "day1": {
        "theme": "day theme",
        "bestTimeToVisit": "suggested time",
        "estimatedDailyCost": "estimate and currency",
        "plan": [
          {
            "time": "HH:MM",
            "placeName": "place or activity",
            "placeDetails": "description",
            "ticketPricing": "estimate or unknown",
            "timeToTravel": "estimated travel time",
            "placeUrl": ""
          }
        ]
      }
    }
  }
}

Make one itinerary entry for each of the ${duration.days} trip days, named day1, day2, and so on. Suggest hotels and activities that fit the destination and budget. If the trip has zero nights, do not suggest a hotel stay.

Do not claim prices, availability, opening hours, or ratings are live or verified. Do not invent a departure airport, direct image URLs, or uncertain coordinates. Use estimates and identify the currency when possible. Use a booking link only when you are reasonably confident it is relevant; otherwise use an empty string.
`;
}

// Create a travel plan when the website submits its form.
app.post("/api/trip-plan", async (req, res) => {
  try {
    const trip = req.body || {};
    const location = trip.locationInfo;
    const coordinates = location && location.coordinates;

    // The destination must be a valid selection with coordinates.
    if (
      !location ||
      typeof location.name !== "string" ||
      !location.name.trim() ||
      typeof location.formattedAddress !== "string" ||
      !location.formattedAddress.trim() ||
      !coordinates ||
      !Number.isFinite(coordinates.latitude) ||
      !Number.isFinite(coordinates.longitude) ||
      coordinates.latitude < -90 ||
      coordinates.latitude > 90 ||
      coordinates.longitude < -180 ||
      coordinates.longitude > 180
    ) {
      return res.status(400).json({
        error: "Select a valid destination from Google Places.",
      });
    }

    // tests if the dates are valid or not
    const startDate = parseDate(trip.from);
    const endDate = parseDate(trip.to);

    if (!startDate || !endDate || endDate < startDate) {
      return res.status(400).json({
        error: "Please provide valid travel dates.",
      });
    }

    const duration = getDuration(trip.from, trip.to);

    if (duration.days > 30) {
      return res.status(400).json({
        error: "Please select a trip lasting 30 days or fewer.",
      });
    }

    // budget and group size must match the options used by the website.
    const budget = String(trip.budget);
    const people = String(trip.people);

    if (
      !Object.prototype.hasOwnProperty.call(BUDGET_TYPES, budget) ||
      !ALLOWED_PEOPLE.includes(people)
    ) {
      return res.status(400).json({
        error: "Please select a valid budget and traveler count.",
      });
    }

    // time must be in 24-hour HH:MM format.
    const time = trip.time == null ? null : trip.time;

    if (
      time !== null &&
      (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    ) {
      return res.status(400).json({
        error: "Please select a valid preferred time.",
      });
    }

    // this keeps the api key in the server side only
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "The Gemini API key is missing from the server configuration.",
      });
    }

    const cleanTrip = { ...trip, budget, people, time };
    const geminiUrl =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      "gemini-3.8-flash:generateContent";

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildPrompt(cleanTrip) }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          thinkingConfig: {
            thinkingLevel: "low",
          },
        },
      }),
    });

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error("Gemini request failed:", geminiResponse.status);
      return res.status(502).json({
        error: "Gemini could not generate your itinerary. Please try again.",
      });
    }

    const candidate = geminiData.candidates && geminiData.candidates[0];

    if (candidate && candidate.finishReason === "SAFETY") {
      return res.status(502).json({
        error:
          "The request could not be completed. Please try a different destination or prompt.",
      });
    }

    const parts = candidate && candidate.content && candidate.content.parts;
    const generatedText = parts
      ? parts
          .map((part) => part.text || "")
          .join("")
          .trim()
      : "";

    if (!generatedText) {
      return res.status(502).json({
        error: "Gemini returned an empty itinerary. Please try again.",
      });
    }

    let result;

    try {
      result = JSON.parse(generatedText);
    } catch (error) {
      return res.status(502).json({
        error: "The itinerary response was invalid. Please try again.",
      });
    }

    const plan = result && result.travelPlan;

    if (
      !plan ||
      !plan.itinerary ||
      typeof plan.itinerary !== "object" ||
      Array.isArray(plan.itinerary)
    ) {
      return res.status(502).json({
        error: "Gemini returned an incomplete travel plan. Please try again.",
      });
    }

    // will return the same JSON shape expected by the website.
    return res.json(result);
  } catch (error) {
    console.error("Trip plan error:", error.message);

    return res.status(500).json({
      error: "An unexpected server error occurred. Please try again.",
    });
  }
});

// this handles unknown api routes
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API endpoint not found." });
});

// starts the website server.
app.listen(PORT, () => {
  console.log(`ItineraTrip running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT}/app/html/index.html`);
});
