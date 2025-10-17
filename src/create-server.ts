/**
  * MCP Weather Server
  *
  * Exposes two tools over the Model Context Protocol (MCP):
  * - get-alerts(state): Returns active National Weather Service (NWS) alerts for a US state.
  *   - Input: { state: 2-letter code, e.g., "CA" }
  *   - Output: Text summary of active alerts or a no-alerts message.
  * - get-forecast(latitude, longitude): Returns an NWS point forecast for given coordinates.
  *   - Input: { latitude: -90..90, longitude: -180..180 }
  *   - Output: Text summary of forecast periods (name, temperature, wind, short description).
  *
  * Implementation notes
  * - Uses the public NWS API (https://api.weather.gov). A descriptive User-Agent is required by NWS policy.
  * - Responses are formatted as plain text for simple consumption by agents or UIs.
  * - All network calls are wrapped with basic error handling and return null-safe fallbacks.
  */
  import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
  import { z } from "zod";

  const NWS_API_BASE = "https://api.weather.gov";
  // Identify this client per NWS requirements. Update only if you own the contact string.
  const USER_AGENT = "weather-app/1.0";

  /**
   * Perform a typed fetch against the NWS API with required headers.
   *
   * @template T Expected response JSON shape
   * @param url Fully-qualified NWS API URL
   * @returns Parsed JSON on success, or null if the request fails
   */
  async function makeNWSRequest<T>(url: string): Promise<T | null> {
    const headers = {
      "User-Agent": USER_AGENT,
      Accept: "application/geo+json",
    };

    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      console.error("Error making NWS request:", error);
      return null;
    }
  }

  /**
   * Minimal NWS alert feature shape used by this server.
   */
  interface AlertFeature {
    properties: {
      event?: string;
      areaDesc?: string;
      severity?: string;
      status?: string;
      headline?: string;
    };
  }

  /**
   * Convert an alert into a human-readable text block.
   */
  function formatAlert(feature: AlertFeature): string {
    const props = feature.properties;
    return [
      `Event: ${props.event || "Unknown"}`,
      `Area: ${props.areaDesc || "Unknown"}`,
      `Severity: ${props.severity || "Unknown"}`,
      `Status: ${props.status || "Unknown"}`,
      `Headline: ${props.headline || "No headline"}`,
      "---",
    ].join("\n");
  }

  /**
   * Subset of the NWS forecast period fields consumed by this server.
   */
  interface ForecastPeriod {
    name?: string;
    temperature?: number;
    temperatureUnit?: string;
    windSpeed?: string;
    windDirection?: string;
    shortForecast?: string;
  }

  /**
   * NWS alerts GeoJSON wrapper.
   */
  interface AlertsResponse {
    features: AlertFeature[];
  }

  /**
   * Response for NWS points API used to discover forecast URL.
   */
  interface PointsResponse {
    properties: {
      forecast?: string;
    };
  }

  /**
   * Response shape for forecast periods.
   */
  interface ForecastResponse {
    properties: {
      periods: ForecastPeriod[];
    };
  }

  /**
   * Factory that creates and configures the MCP server with weather tools.
   *
   * @returns An object containing the configured `server` instance
   */
  export const createServer = () => {
    // Create server instance with a stable name/version for client discovery.
    const server = new McpServer({
      name: "weather",
      version: "1.0.0",
    });

    // Register tools exposed by this MCP server.
    server.tool(
      "get-alerts",
      "Get weather alerts for a state",
      {
        state: z
          .string()
          .length(2)
          .describe("Two-letter state code (e.g. CA, NY)"),
      },
      async ({ state }) => {
        // Normalize state code and call NWS alerts endpoint.
        const stateCode = state.toUpperCase();
        const alertsUrl = `${NWS_API_BASE}/alerts?area=${stateCode}`;
        const alertsData = await makeNWSRequest<AlertsResponse>(alertsUrl);

        if (!alertsData) {
          return {
            content: [
              {
                type: "text",
                text: "Failed to retrieve alerts data",
              },
            ],
          };
        }

        const features = alertsData.features || [];
        if (features.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No active alerts for ${stateCode}`,
              },
            ],
          };
        }

        // Convert features into a readable, bounded text response.
        const formattedAlerts = features.map(formatAlert);
        const alertsText = `Active alerts for ${stateCode}:\n\n${formattedAlerts.join(
          "\n"
        )}`;

        return {
          content: [
            {
              type: "text",
              text: alertsText,
            },
          ],
        };
      }
    );

    server.tool(
      "get-forecast",
      "Get weather forecast for a location",
      {
        latitude: z
          .number()
          .min(-90)
          .max(90)
          .describe("Latitude of the location"),
        longitude: z
          .number()
          .min(-180)
          .max(180)
          .describe("Longitude of the location"),
      },
      async ({ latitude, longitude }) => {
        // Step 1: Resolve grid point and the forecast URL for the given coordinates.
        const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(
          4
        )},${longitude.toFixed(4)}`;
        const pointsData = await makeNWSRequest<PointsResponse>(pointsUrl);

        if (!pointsData) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to retrieve grid point data for coordinates: ${latitude}, ${longitude}. This location may not be supported by the NWS API (only US locations are supported).`,
              },
            ],
          };
        }

        const forecastUrl = pointsData.properties?.forecast;
        if (!forecastUrl) {
          return {
            content: [
              {
                type: "text",
                text: "Failed to get forecast URL from grid point data",
              },
            ],
          };
        }

        // Step 2: Fetch the actual forecast periods using the discovered URL.
        const forecastData = await makeNWSRequest<ForecastResponse>(forecastUrl);
        if (!forecastData) {
          return {
            content: [
              {
                type: "text",
                text: "Failed to retrieve forecast data",
              },
            ],
          };
        }

        const periods = forecastData.properties?.periods || [];
        if (periods.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No forecast periods available",
              },
            ],
          };
        }

        // Format forecast periods into a concise human-readable list.
        const formattedForecast = periods.map((period: ForecastPeriod) =>
          [
            `${period.name || "Unknown"}:`,
            `Temperature: ${period.temperature || "Unknown"}°${
              period.temperatureUnit || "F"
            }`,
            `Wind: ${period.windSpeed || "Unknown"} ${
              period.windDirection || ""
            }`,
            `${period.shortForecast || "No forecast available"}`,
            "---",
          ].join("\n")
        );

        const forecastText = `Forecast for ${latitude}, ${longitude}:\n\n${formattedForecast.join(
          "\n"
        )}`;

        return {
          content: [
            {
              type: "text",
              text: forecastText,
            },
          ],
        };
      }
    );

    return { server };
  };
