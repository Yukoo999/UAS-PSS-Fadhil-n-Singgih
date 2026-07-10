import { describe, expect, it } from "bun:test";
import { app } from "../src/index";
import { env } from "../src/config/env";

describe("UAS Backend Chatbot - API Unit Tests", () => {
  
  // 1. Test Root Route (Public)
  it("GET / - Harus mengembalikan status 200 & status server online", async () => {
    const response = await app.request("/");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Bot Admin Diskominfo is Online!");
  });

  // 2. Test Auth Middleware - Block Unauthorized
  it("GET /api/sessions - Tanpa token harus mengembalikan status 401 Unauthorized", async () => {
    const response = await app.request("/api/sessions");
    expect(response.status).toBe(401);
  });

  it("GET /api/ratings - Tanpa token harus mengembalikan status 401 Unauthorized", async () => {
    const response = await app.request("/api/ratings");
    expect(response.status).toBe(401);
  });

  it("GET /api/sessions - Dengan token salah harus mengembalikan status 401 Unauthorized", async () => {
    const response = await app.request("/api/sessions", {
      headers: {
        Authorization: "Bearer token_salah_banget"
      }
    });
    expect(response.status).toBe(401);
  });

  // 3. Test Auth Middleware - Allow Authorized
  it("GET /api/sessions - Dengan token benar harus diizinkan masuk (tidak 401)", async () => {
    const response = await app.request("/api/sessions", {
      headers: {
        Authorization: `Bearer ${env.ADMIN_API_KEY}`
      }
    });
    // Jika database menyala, status akan 200. Jika offline, bisa jadi 500.
    // Yang terpenting adalah statusnya BUKAN 401 (Unauthorized)
    expect(response.status).not.toBe(401);
  });
});
