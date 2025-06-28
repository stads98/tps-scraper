// Ensure the window.proxyHandler object is properly initialized
if (typeof window.proxyHandler === "undefined") {
  window.proxyHandler = {
    parseProxyFile: (content) => {
      if (!content) return []

      // Split by newlines and filter out empty lines
      const lines = content.split("\n").filter((line) => line.trim() !== "")

      // Parse each line into a proxy object
      return lines
        .map((line) => {
          const parts = line.trim().split(":")
          if (parts.length < 4) {
            // If format is not complete, try to parse what we have
            return {
              host: parts[0] || "",
              port: parts[1] || "",
              username: parts[2] || "",
              password: parts[3] || "",
              blocked: false,
              lastUsed: null,
            }
          }

          return {
            host: parts[0],
            port: parts[1],
            username: parts[2],
            password: parts[3],
            blocked: false,
            lastUsed: null,
          }
        })
        .filter((proxy) => proxy.host && proxy.port) // Filter out invalid proxies
    },
    getNextProxy: (proxies, blockedProxies = []) => {
      if (!proxies || proxies.length === 0) return null

      // Filter out blocked proxies
      const availableProxies = proxies.filter(
        (proxy) =>
          !proxy.blocked &&
          !blockedProxies.some((blocked) => blocked.host === proxy.host && blocked.port === proxy.port),
      )

      if (availableProxies.length === 0) return null

      // Sort by last used time (null first, then oldest first)
      availableProxies.sort((a, b) => {
        if (a.lastUsed === null) return -1
        if (b.lastUsed === null) return 1
        return a.lastUsed - b.lastUsed
      })

      // Return the first available proxy
      const proxy = availableProxies[0]
      proxy.lastUsed = Date.now()
      return proxy
    },
    markProxyAsBlocked: (proxies, proxyToBlock) => {
      if (!proxies || proxies.length === 0 || !proxyToBlock) return proxies

      return proxies.map((proxy) => {
        if (proxy.host === proxyToBlock.host && proxy.port === proxy.port) {
          return { ...proxy, blocked: true }
        }
        return proxy
      })
    },
    applyProxy: async (proxy) => {
      console.log("Applying proxy:", proxy)
      return true
    },
    clearProxy: async () => {
      console.log("Clearing proxy")
      return true
    },
  }
}

// Proxy handling functionality for TruePeopleSearch Scraper

// Parse proxy file content
function parseProxyFile(content) {
  if (!content) return []

  // Split by newlines and filter out empty lines
  const lines = content.split("\n").filter((line) => line.trim() !== "")

  // Parse each line into a proxy object
  return lines
    .map((line) => {
      const parts = line.trim().split(":")
      if (parts.length < 4) {
        // If format is not complete, try to parse what we have
        return {
          host: parts[0] || "",
          port: parts[1] || "",
          username: parts[2] || "",
          password: parts[3] || "",
          blocked: false,
          lastUsed: null,
        }
      }

      return {
        host: parts[0],
        port: parts[1],
        username: parts[2],
        password: parts[3],
        blocked: false,
        lastUsed: null,
      }
    })
    .filter((proxy) => proxy.host && proxy.port) // Filter out invalid proxies
}

// Get the next available proxy
function getNextProxy(proxies, blockedProxies = []) {
  if (!proxies || proxies.length === 0) return null

  // Filter out blocked proxies
  const availableProxies = proxies.filter(
    (proxy) =>
      !proxy.blocked && !blockedProxies.some((blocked) => blocked.host === proxy.host && blocked.port === proxy.port),
  )

  if (availableProxies.length === 0) return null

  // Sort by last used time (null first, then oldest first)
  availableProxies.sort((a, b) => {
    if (a.lastUsed === null) return -1
    if (b.lastUsed === null) return 1
    return a.lastUsed - b.lastUsed
  })

  // Return the first available proxy
  const proxy = availableProxies[0]
  proxy.lastUsed = Date.now()
  return proxy
}

// Mark a proxy as blocked
function markProxyAsBlocked(proxies, proxyToBlock) {
  if (!proxies || proxies.length === 0 || !proxyToBlock) return proxies

  return proxies.map((proxy) => {
    if (proxy.host === proxyToBlock.host && proxy.port === proxy.port) {
      return { ...proxy, blocked: true }
    }
    return proxy
  })
}

// Enhance the applyProxy function to properly handle authentication
async function applyProxy(proxy) {
  // Check if chrome API is available
  if (typeof chrome === "undefined" || !chrome.proxy) {
    console.warn("Chrome API not available. Ensure this code is running within a Chrome extension context.")
    return false
  }

  if (!proxy || !proxy.host || !proxy.port) {
    console.error("Invalid proxy configuration")
    return false
  }

  try {
    console.log("Applying proxy with full details:", {
      host: proxy.host,
      port: proxy.port,
      username: proxy.username ? "provided" : "missing",
      password: proxy.password ? "provided" : "missing",
    })

    // Use fixed_servers mode for better authentication handling
    // Include credentials directly in the proxy configuration
    const config = {
      mode: "fixed_servers",
      rules: {
        singleProxy: {
          scheme: "http",
          host: proxy.host,
          port: Number.parseInt(proxy.port, 10),
          username: proxy.username, // Include username directly in config
          password: proxy.password, // Include password directly in config
        },
        bypassList: ["localhost", "127.0.0.1"],
      },
    }

    // Set proxy configuration
    try {
      await chrome.proxy.settings.set({
        value: config,
        scope: "regular",
      })
    } catch (e) {
      console.error("Error setting proxy:", e)
      return false
    }

    // Store the current proxy for tracking and authentication
    chrome.storage.local.set({
      currentProxy: proxy,
      currentProxyAppliedTime: Date.now(),
      proxyCredentials: {
        username: proxy.username,
        password: proxy.password,
      },
    })

    console.log(`Applied proxy: ${proxy.host}:${proxy.port} with username: ${proxy.username || "none"}`)
    return true
  } catch (error) {
    console.error("Error applying proxy:", error)
    return false
  }
}

// Enhance the clearProxy function to also clear the current proxy in storage
async function clearProxy() {
  // Check if chrome API is available
  if (typeof chrome === "undefined" || !chrome.proxy) {
    console.warn("Chrome API not available. Ensure this code is running within a Chrome extension context.")
    return false
  }
  try {
    await chrome.proxy.settings.clear({ scope: "regular" })

    // Clear stored credentials and current proxy
    chrome.storage.local.remove(["proxyCredentials", "currentProxy"])

    console.log("Proxy settings cleared")
    return true
  } catch (error) {
    console.error("Error clearing proxy:", error)
    return false
  }
}

// Add a function to test a proxy
async function testProxy(proxy) {
  if (!proxy || !proxy.host || !proxy.port) {
    console.error("Invalid proxy configuration for testing")
    return { success: false, error: "Invalid proxy configuration" }
  }

  try {
    console.log("Testing proxy:", proxy)

    // Store the original proxy settings to restore later
    let originalSettings
    try {
      originalSettings = await chrome.proxy.settings.get({})
    } catch (e) {
      console.error("Error getting original proxy settings:", e)
      return { success: false, error: "Could not retrieve original proxy settings" }
    }

    // Apply a temporary PAC script that only routes the test URL through the proxy
    const tempConfig = {
      mode: "pac_script",
      pacScript: {
        data: `
          function FindProxyForURL(url, host) {
            if (shExpMatch(host, "api.ipify.org")) {
              return "PROXY ${proxy.host}:${proxy.port}";
            }
            return "DIRECT";
          }
        `,
      },
    }

    // Set temporary proxy configuration
    try {
      await chrome.proxy.settings.set({
        value: tempConfig,
        scope: "regular",
      })
    } catch (e) {
      console.error("Error setting temporary proxy:", e)
      return { success: false, error: "Could not set temporary proxy settings" }
    }

    // Store credentials for authentication
    chrome.storage.local.set({
      currentProxy: proxy,
    })

    // Try to fetch a test URL through the proxy
    const testUrl = "https://api.ipify.org?format=json"

    return new Promise((resolve) => {
      // Set a timeout in case the request hangs
      const timeoutId = setTimeout(() => {
        // Restore original settings
        try {
          chrome.proxy.settings.set({
            value: originalSettings.value,
            scope: "regular",
          })
        } catch (e) {
          console.error("Error restoring original proxy settings after timeout:", e)
        }
        resolve({ success: false, error: "Request timed out" })
      }, 10000)

      fetch(testUrl)
        .then((response) => {
          clearTimeout(timeoutId)
          if (!response.ok) {
            // Restore original settings
            try {
              chrome.proxy.settings.set({
                value: originalSettings.value,
                scope: "regular",
              })
            } catch (e) {
              console.error("Error restoring original proxy settings after failed response:", e)
            }
            resolve({ success: false, error: `HTTP error: ${response.status}` })
            return
          }
          return response.json()
        })
        .then((data) => {
          // Restore original settings
          try {
            chrome.proxy.settings.set({
              value: originalSettings.value,
              scope: "regular",
            })
          } catch (e) {
            console.error("Error restoring original proxy settings after successful response:", e)
          }

          if (data && data.ip) {
            resolve({ success: true, ip: data.ip })
          } else {
            resolve({ success: false, error: "Invalid response from IP service" })
          }
        })
        .catch((error) => {
          clearTimeout(timeoutId)
          // Restore original settings
          try {
            chrome.proxy.settings.set({
              value: originalSettings.value,
              scope: "regular",
            })
          } catch (e) {
            console.error("Error restoring original proxy settings after fetch error:", e)
          }
          resolve({ success: false, error: error.message })
        })
    })
  } catch (error) {
    console.error("Error testing proxy:", error)
    return { success: false, error: error.message }
  }
}

// Update the window.proxyHandler object
window.proxyHandler = {
  parseProxyFile,
  getNextProxy,
  markProxyAsBlocked,
  applyProxy,
  clearProxy,
  testProxy,
}

// Add a function to test proxy authentication specifically
window.proxyHandler.testProxyAuth = async (proxy) => {
  if (!proxy || !proxy.host || !proxy.port) {
    console.error("Invalid proxy configuration for auth testing")
    return { success: false, error: "Invalid proxy configuration" }
  }

  try {
    console.log("Testing proxy authentication for:", proxy)

    // Create a test URL that requires authentication
    const testUrl = "https://httpbin.org/basic-auth/user/passwd"

    // Create headers with proxy authentication
    const headers = new Headers()
    if (proxy.username && proxy.password) {
      const auth = btoa(`${proxy.username}:${proxy.password}`)
      headers.append("Proxy-Authorization", `Basic ${auth}`)
    }

    // Try to fetch with explicit proxy authentication
    const response = await fetch(testUrl, {
      headers: headers,
      // Note: fetch doesn't support direct proxy configuration,
      // we rely on the Chrome proxy settings being applied
    })

    if (response.ok) {
      return { success: true, message: "Proxy authentication successful" }
    } else {
      return { success: false, error: `HTTP error: ${response.status}` }
    }
  } catch (error) {
    console.error("Error testing proxy authentication:", error)
    return { success: false, error: error.message }
  }
}

// Add a function to directly set proxy authentication credentials
window.proxyHandler.setProxyCredentials = (username, password) =>
  new Promise((resolve) => {
    chrome.storage.local.set(
      {
        proxyCredentials: {
          username: username,
          password: password,
        },
      },
      () => {
        console.log("Proxy credentials set manually:", { username, password })
        resolve(true)
      },
    )
  })
