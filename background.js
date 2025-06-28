// Initialize storage
let scrapedData = [] // Persistent global array to store scraped data
let csvProcessingData = null // Store CSV processing state

// Add these variables to track CAPTCHA state
let captchaDetected = false
let captchaTabId = null
let processingPausedForCaptcha = false
let captchaRetryDelay = 30000 // 30 seconds default delay after CAPTCHA

// Add these variables for proxy handling
let blockedProxies = []
// Add these variables for better proxy tracking
let currentProxy = null
const currentProxyIndex = 0
let currentProcessingUrl = null

// Function to generate an enriched CSV string from processed data
function generateEnrichedCsvString(data, originalHeaders) {
  // Define the headers for the new data we added.
  const tpsDataHeaders = [
    "TPS_Name",
    "TPS_Address",
    "TPS_Phone1",
    "TPS_Phone2",
    "TPS_Phone3",
    "TPS_Phone4",
    "TPS_Email1",
    "TPS_Email2",
    "TPS_Email3",
    "TPS_ScrapedAt",
  ]

  // The final list of headers is the original ones plus our new ones.
  const finalHeaders = [...originalHeaders]
  tpsDataHeaders.forEach((h) => {
    if (!finalHeaders.includes(h)) {
      finalHeaders.push(h)
    }
  })

  // Also include the internal processing fields for reference
  if (!finalHeaders.includes("_tpsSearchUrl")) finalHeaders.push("_tpsSearchUrl")
  if (!finalHeaders.includes("_tpsProcessed")) finalHeaders.push("_tpsProcessed")

  // Helper to escape values for CSV
  const escapeCsvValue = (value) => {
    if (value === null || value === undefined) {
      return '""'
    }
    const stringValue = String(value)
    if (stringValue.includes('"') || stringValue.includes(",") || stringValue.includes("\n")) {
      return `"${stringValue.replace(/"/g, '""')}"`
    }
    return stringValue
  }

  // Create the header row for the CSV file.
  const headerRow = finalHeaders.map(escapeCsvValue).join(",")

  // Create the data rows.
  const dataRows = data.map((row) => {
    return finalHeaders
      .map((header) => {
        return escapeCsvValue(row[header])
      })
      .join(",")
  })

  // Combine header and data rows.
  return [headerRow, ...dataRows].join("\n")
}

// Proxy handling functions directly in background script
// These replace the window.proxyHandler references
const proxyHandler = {
  getNextProxy: (proxies, blockedProxies = []) => {
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
  },

  applyProxy: async (proxy) => {
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

      // Store the credentials first to ensure they're available when auth is requested
      await new Promise((resolve) => {
        chrome.storage.local.set(
          {
            currentProxy: proxy,
            currentProxyAppliedTime: Date.now(),
            proxyCredentials: {
              username: proxy.username || "",
              password: proxy.password || "",
            },
          },
          resolve,
        )
      })

      console.log("Proxy credentials stored, now applying proxy settings")

      // Use fixed_servers mode for better authentication handling
      const config = {
        mode: "fixed_servers",
        rules: {
          singleProxy: {
            scheme: "http",
            host: proxy.host,
            port: Number.parseInt(proxy.port, 10),
          },
          bypassList: ["localhost", "127.0.0.1"],
        },
      }

      // Set proxy configuration
      await chrome.proxy.settings.set({
        value: config,
        scope: "regular",
      })

      console.log(`Applied proxy: ${proxy.host}:${proxy.port} with username: ${proxy.username || "none"}`)

      // Ensure the auth handler is set up
      setupProxyAuthHandler()

      return true
    } catch (error) {
      console.error("Error applying proxy:", error)
      return false
    }
  },

  clearProxy: async () => {
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
  },

  testProxy: async (proxy) => {
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

      // Apply a temporary fixed_servers configuration for testing
      const tempConfig = {
        mode: "fixed_servers",
        rules: {
          singleProxy: {
            scheme: "http",
            host: proxy.host,
            port: Number.parseInt(proxy.port, 10),
          },
          bypassList: ["localhost", "127.0.0.1"],
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
        proxyCredentials: {
          username: proxy.username,
          password: proxy.password,
        },
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
  },
}

// Improved CSV value escaping function
function escapeCsvValue(value) {
  if (value === null || value === undefined || value === "") {
    return '"N/A"' // Return N/A in quotes for empty values
  }

  if (typeof value !== "string") {
    value = String(value)
  }

  // Escape quotes by doubling them
  value = value.replace(/"/g, '""')

  // Enclose in quotes if it contains commas, quotes, spaces, or newlines
  if (value.includes(",") || value.includes('"') || value.includes(" ") || value.includes("\n")) {
    value = `"${value}"`
  }

  return value
}

// Load data from storage when the extension starts
chrome.storage.local.get(
  [
    "scrapedData",
    "csvProcessingData",
    "captchaRetryDelay",
    "captchaDetected",
    "processingPausedForCaptcha",
    "captchaTabId",
    "blockedProxies",
    "currentProxy",
    "currentProcessingUrl",
    "currentProcessingIndex",
  ],
  (result) => {
    scrapedData = result.scrapedData || []
    csvProcessingData = result.csvProcessingData || null

    if (result.captchaRetryDelay) {
      captchaRetryDelay = result.captchaRetryDelay
    }

    if (result.captchaDetected) {
      captchaDetected = result.captchaDetected
    }

    if (result.processingPausedForCaptcha) {
      processingPausedForCaptcha = result.processingPausedForCaptcha
    }

    if (result.captchaTabId) {
      captchaTabId = result.captchaTabId
    }

    blockedProxies = result.blockedProxies || []
    currentProxy = result.currentProxy || null
    currentProcessingUrl = result.currentProcessingUrl || null

    console.log(`Loaded ${scrapedData.length} records from storage.`)

    // Clear any existing proxy settings on startup to ensure clean state
    if (chrome.proxy && chrome.proxy.settings) {
      chrome.proxy.settings.clear({ scope: "regular" }, () => {
        console.log("Cleared proxy settings on startup")
      })
    }
  },
)

// Add this function to apply a proxy and update the UI
async function applyAndTrackProxy(proxy) {
  if (!proxy || !proxy.host || !proxy.port) {
    console.error("Invalid proxy configuration")
    return false
  }

  try {
    // Apply the proxy using the proxy handler
    const success = await proxyHandler.applyProxy(proxy)

    if (success) {
      // Update the current proxy
      currentProxy = proxy

      // Store the current proxy in storage for UI display
      chrome.storage.local.set({
        currentProxy: proxy,
        currentProxyAppliedTime: Date.now(),
      })

      console.log(`Applied proxy: ${proxy.host}:${proxy.port}`)

      // Send a message to any open tabs to update the proxy display
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.url && tab.url.includes("truepeoplesearch.com")) {
            chrome.tabs
              .sendMessage(tab.id, {
                type: "proxy_changed",
                proxy: {
                  host: proxy.host,
                  port: proxy.port,
                },
              })
              .catch((err) => console.log("Error sending proxy change message:", err))
          }
        })
      })

      return true
    } else {
      console.error("Failed to apply proxy")
      return false
    }
  } catch (error) {
    console.error("Error applying proxy:", error)
    return false
  }
}

// Update the chrome.runtime.onMessage listener to handle proxy blocking
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "store_data") {
    try {
      // Check if we already have this person (by name and location)
      const isDuplicate = scrapedData.some(
        (item) => item.Name === message.data.Name && item.Location === message.data.Location,
      )

      if (isDuplicate) {
        console.log("Duplicate entry detected. Updating existing record.")
        // Replace the existing entry with the new one
        scrapedData = scrapedData.map((item) => {
          if (item.Name === message.data.Name && item.Location === message.data.Location) {
            return message.data
          }
          return item
        })
      } else {
        // Add new entry
        scrapedData.push(message.data)
      }

      // Save the updated data to storage
      chrome.storage.local.set({ scrapedData }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error saving data:", chrome.runtime.lastError)
          sendResponse({ success: false, message: chrome.runtime.lastError.message })
        } else {
          console.log(`Data saved. Total records: ${scrapedData.length}`)

          // Check if we're processing a CSV file
          chrome.storage.local.get(["currentProcessingTab", "currentProcessingIndex", "processingActive"], (result) => {
            if (result.processingActive && sender.tab && sender.tab.id === result.currentProcessingTab) {
              // Update the processed data with the scraped information
              chrome.storage.local.get("csvProcessingData", (csvResult) => {
                if (csvResult.csvProcessingData && csvResult.csvProcessingData.data) {
                  const csvData = csvResult.csvProcessingData.data

                  if (csvData[result.currentProcessingIndex]) {
                    // Mark this record as processed
                    csvData[result.currentProcessingIndex]._tpsProcessed = true

                    // Explicitly add only the desired fields to the record
                    const scraped = message.data;
                    csvData[result.currentProcessingIndex]['TPS_Name'] = scraped.Name;
                    csvData[result.currentProcessingIndex]['TPS_Address'] = scraped.Address;
                    csvData[result.currentProcessingIndex]['TPS_Phone1'] = scraped.Phone1;
                    csvData[result.currentProcessingIndex]['TPS_Phone2'] = scraped.Phone2;
                    csvData[result.currentProcessingIndex]['TPS_Phone3'] = scraped.Phone3;
                    csvData[result.currentProcessingIndex]['TPS_Phone4'] = scraped.Phone4;
                    csvData[result.currentProcessingIndex]['TPS_Email1'] = scraped.Email1;
                    csvData[result.currentProcessingIndex]['TPS_Email2'] = scraped.Email2;
                    csvData[result.currentProcessingIndex]['TPS_Email3'] = scraped.Email3;
                    csvData[result.currentProcessingIndex]['TPS_ScrapedAt'] = scraped.ScrapedAt;

                    // Save the updated CSV data
                    chrome.storage.local.set({
                      csvProcessingData: {
                        ...csvResult.csvProcessingData,
                        data: csvData,
                      },
                    })
                  }
                }
              })
            }
          })

          sendResponse({ success: true })
        }
      })
    } catch (error) {
      console.error("Error processing data:", error)
      sendResponse({ success: false, message: error.message })
    }
    return true // Keep the message channel open for the async response
  } else if (message.type === "download_csv") {
    if (scrapedData.length === 0) {
      console.error("No data to export.")
      sendResponse({ success: false, message: "No data to export." })
      return true
    }

    try {
      // Define CSV columns in the exact order we want them in the file
      const columns = [
        "Name",
        "Location",
        "City",
        "State",
        "Address",
        "Phone1",
        "Phone2",
        "Phone3",
        "Phone4",
        "Email1",
        "Email2",
        "Email3",
        "ScrapedAt",
      ]

      // Create CSV header
      const csvHeader = columns.join(",") + "\r\n"

      // Convert data to CSV rows with proper escaping
      const csvRows = scrapedData.map((row) => {
        // Make a copy of the row to avoid modifying the original
        const sanitizedRow = { ...row }

        // Ensure all required fields exist and replace empty values with N/A
        columns.forEach((col) => {
          if (sanitizedRow[col] === undefined || sanitizedRow[col] === "" || sanitizedRow[col] === null) {
            sanitizedRow[col] = "N/A"
          }
        })

        // Map each column to its escaped value in the exact order of columns
        return columns.map((col) => escapeCsvValue(sanitizedRow[col])).join(",")
      })

      // Join rows with Windows-style line endings for better Excel compatibility
      const csvContent = csvRows.join("\r\n")

      // Combine header and content
      const csv = csvHeader + csvContent

      // Generate filename with date
      const date = new Date().toISOString().split("T")[0]
      const filename = `truepeoplesearch_data_${date}.csv`

      // Add BOM for proper UTF-8 encoding in Excel
      const bomPrefix = "\uFEFF"
      const csvWithBOM = bomPrefix + csv

      // Use Data URI approach
      const dataUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csvWithBOM)

      // Download the file
      chrome.downloads.download(
        {
          url: dataUri,
          filename: filename,
          conflictAction: "uniquify",
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error("Download error:", chrome.runtime.lastError.message)
            sendResponse({ success: false, message: chrome.runtime.lastError.message })
          } else {
            console.log("Download started with ID:", downloadId)
            sendResponse({ success: true })
          }
        },
      )
    } catch (error) {
      console.error("Error generating CSV:", error)
      sendResponse({ success: false, message: error.message })
    }
    return true
  } else if (message.type === "clear_data") {
    // Clear the stored data
    scrapedData = []
    chrome.storage.local.set({ scrapedData }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error clearing data:", chrome.runtime.lastError)
        sendResponse({ success: false, message: chrome.runtime.lastError.message })
      } else {
        console.log("Data cleared from storage.")
        sendResponse({ success: true })
      }
    })
    return true
  } else if (message.type === "get_data_count") {
    // Return the current count of stored records
    sendResponse({ success: true, count: scrapedData.length })
    return false
  } else if (message.type === "store_csv_data") {
    // Store the CSV data for processing
    chrome.storage.local.set({ csvProcessingData: message.data }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error storing CSV data:", chrome.runtime.lastError)
        sendResponse({ success: false, message: chrome.runtime.lastError.message })
      } else {
        console.log("CSV data stored for processing.")
        sendResponse({ success: true })
      }
    })
    return true
  } else if (message.type === "export_processed_csv_from_popup") {
    chrome.storage.local.get(["originalCsvHeaders", "csvProcessingData"], (result) => {
      if (!result.csvProcessingData || !result.csvProcessingData.data || result.csvProcessingData.data.length === 0) {
        sendResponse({ success: false, message: "No processed data found to export." })
        return
      }

      const originalHeaders = result.originalCsvHeaders || []
      const finalData = result.csvProcessingData.data
      const csvString = generateEnrichedCsvString(finalData, originalHeaders)

      const date = new Date().toISOString().split("T")[0]
      const filename = `tps_processed_data_${date}.csv`
      const bomPrefix = "\uFEFF"
      const csvWithBOM = bomPrefix + csvString
      const dataUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csvWithBOM)

      chrome.downloads.download(
        {
          url: dataUri,
          filename: filename,
          conflictAction: "uniquify",
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, message: chrome.runtime.lastError.message })
          } else {
            sendResponse({ success: true })
          }
        },
      )
    })
    return true
  } else if (message.type === "cloudflare_captcha_detected") {
    // Handle CAPTCHA detection
    console.log("Cloudflare CAPTCHA detected in tab:", sender.tab.id, "URL:", message.url)
    captchaDetected = true
    captchaTabId = sender.tab.id
    processingPausedForCaptcha = true

    // Immediately cancel any scheduled processing
    chrome.storage.local.set(
      {
        captchaDetected: true,
        captchaTabId: sender.tab.id,
        processingPausedForCaptcha: true,
        captchaDetectedTime: Date.now(),
        captchaUrl: message.url,
      },
      () => {
        console.log("CAPTCHA state saved, processing paused")
      },
    )

    sendResponse({ success: true })
    return true
  } else if (message.type === "cloudflare_captcha_solved") {
    // Handle CAPTCHA solved
    console.log("Cloudflare CAPTCHA solved in tab:", sender.tab.id, "URL:", message.url)
    captchaDetected = false
    processingPausedForCaptcha = false

    // Store the updated CAPTCHA state
    chrome.storage.local.set(
      {
        captchaDetected: false,
        processingPausedForCaptcha: false,
        captchaSolvedTime: Date.now(),
        resumingAfterCaptcha: true,
      },
      () => {
        console.log("CAPTCHA solved state saved, will resume processing")

        // Resume processing after a delay to allow the page to fully load
        setTimeout(() => {
          resumeProcessingAfterCaptcha()
        }, 3000) // 3 second delay
      },
    )

    sendResponse({ success: true })
    return true
  } else if (message.type === "get_captcha_settings") {
    // Return current CAPTCHA settings
    sendResponse({
      captchaRetryDelay: captchaRetryDelay,
    })
    return true
  } else if (message.type === "set_captcha_settings") {
    // Update CAPTCHA settings
    if (message.captchaRetryDelay) {
      captchaRetryDelay = Number.parseInt(message.captchaRetryDelay)
      chrome.storage.local.set({ captchaRetryDelay })
    }
    sendResponse({ success: true })
    return true
  } else if (message.type === "manual_resume_after_captcha") {
    console.log("Manual resume after CAPTCHA requested")

    // Reset CAPTCHA state
    captchaDetected = false
    processingPausedForCaptcha = false

    // Store the updated state
    chrome.storage.local.set(
      {
        captchaDetected: false,
        processingPausedForCaptcha: false,
        captchaSolvedTime: Date.now(),
        resumingAfterCaptcha: true,
      },
      () => {
        console.log("CAPTCHA state reset, preparing to resume processing")

        // Resume processing
        setTimeout(() => {
          resumeProcessingAfterCaptcha()
        }, 500)
      },
    )

    sendResponse({ success: true })
    return true
  } else if (message.type === "proxy_blocked") {
    console.log("Proxy blocked/failed detected.")
    // Pause processing
    chrome.storage.local.set({ processingActive: false })

    // Mark current proxy as blocked and get the next one
    chrome.storage.local.get(["currentProxy", "blockedProxies", "proxyData"], (result) => {
      let { currentProxy, blockedProxies, proxyData } = result
      blockedProxies = blockedProxies || []

      if (currentProxy) {
        const alreadyBlocked = blockedProxies.some((p) => p.host === currentProxy.host && p.port === currentProxy.port)
        if (!alreadyBlocked) {
          blockedProxies.push(currentProxy)
        }
      }

      // Get the next available proxy
      const nextProxy = proxyHandler.getNextProxy(proxyData, blockedProxies)

      // Save the new state
      chrome.storage.local.set({ blockedProxies }, () => {
        // Notify UI of the blocked list
        chrome.tabs.query({ url: "*://*/csv-uploader.html" }, (tabs) => {
          if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, { type: "update_blocked_proxies_list", blockedProxies })
          }
        })
      })

      if (nextProxy) {
        // Apply the next proxy immediately
        applyAndTrackProxy(nextProxy).then(() => {
          // Notify UI to show resume button with info about the new proxy
          chrome.tabs.query({ url: "*://*/csv-uploader.html" }, (tabs) => {
            if (tabs.length > 0) {
              chrome.tabs.sendMessage(tabs[0].id, { type: "proxy_failed_show_resume", nextProxy: nextProxy })
            }
          })
        })
      } else {
        // No more proxies
        chrome.tabs.query({ url: "*://*/csv-uploader.html" }, (tabs) => {
          if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, { type: "no_more_proxies" })
          }
        })
      }
    })

    sendResponse({ success: true })
    return true
  } else if (message.type === "resume_processing_after_skip") {
    // This message comes from the skip button in the UI
    console.log("Resuming processing after user skipped failed proxy.")
    chrome.storage.local.set({ processingActive: true }, () => {
      // The UI will call processNextRecord, which will get a new proxy.
      sendResponse({ success: true })
    })
    return true
  } else if (message.type === "get_next_proxy") {
    // Get the next available proxy
    chrome.storage.local.get(["proxyData"], (result) => {
      if (result.proxyData && result.proxyData.length > 0) {
        const nextProxy = proxyHandler.getNextProxy(result.proxyData, blockedProxies)
        sendResponse({ success: true, proxy: nextProxy })
      } else {
        sendResponse({ success: false, message: "No proxy data available" })
      }
    })
    return true
  } else if (message.type === "test_proxy") {
    console.log("Testing proxy:", message.proxy)

    // Use the proxy handler to test the proxy
    proxyHandler
      .testProxy(message.proxy)
      .then((result) => {
        console.log("Proxy test result:", result)
        sendResponse(result)
      })
      .catch((error) => {
        console.error("Error testing proxy:", error)
        sendResponse({ success: false, error: error.message })
      })

    return true // Keep the message channel open for the async response
  } else if (message.type === "apply_proxy") {
    if (message.proxy) {
      applyAndTrackProxy(message.proxy).then((success) => {
        sendResponse({ success: success })
      })
    } else {
      sendResponse({ success: false, error: "No proxy provided." })
    }
    return true // async
  } else if (message.type === "disconnect_proxy") {
    proxyHandler.clearProxy().then((success) => {
      if (success) {
        console.log("Proxy disconnected by user.")
        sendResponse({ success: true })
      } else {
        console.error("Failed to disconnect proxy on user request.")
        sendResponse({ success: false, message: "Could not clear proxy settings." })
      }
    })
    return true // async
  }
})

// Modify the retryCurrentUrl function to be more robust
function retryCurrentUrl(currentIndex, tabId) {
  chrome.storage.local.get(["csvProcessingData"], (result) => {
    if (result.csvProcessingData && result.csvProcessingData.data && currentIndex !== undefined) {
      // Get the current record
      const record = result.csvProcessingData.data[currentIndex]

      if (record && record._tpsSearchUrl) {
        console.log(`Retrying URL: ${record._tpsSearchUrl}`)

        // Store the current processing URL
        currentProcessingUrl = record._tpsSearchUrl
        chrome.storage.local.set({ currentProcessingUrl: record._tpsSearchUrl })

        // Update the current tab with the URL or create a new one
        if (tabId) {
          chrome.tabs.update(tabId, { url: record._tpsSearchUrl })
        } else {
          // Create a new tab if needed
          chrome.tabs.create({ url: record._tpsSearchUrl, active: true }, (tab) => {
            chrome.storage.local.set({ currentProcessingTab: tab.id })
          })
        }
      }
    }
  })
}

// Add this function to check if processing is currently paused due to CAPTCHA
function isCaptchaPaused() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["processingPausedForCaptcha"], (result) => {
      resolve(result.processingPausedForCaptcha === true)
    })
  })
}

// Improve the resumeProcessingAfterCaptcha function to be more reliable
function resumeProcessingAfterCaptcha() {
  console.log("Attempting to resume processing after CAPTCHA")

  // First clear the CAPTCHA flags
  chrome.storage.local.set(
    {
      captchaDetected: false,
      processingPausedForCaptcha: false,
      resumingAfterCaptcha: true,
      captchaSolvedTime: Date.now(),
    },
    () => {
      console.log("CAPTCHA flags cleared, now checking processing state")

      // Then check if we were actively processing
      chrome.storage.local.get(
        ["currentProcessingIndex", "processingActive", "captchaTabId", "currentProcessingTab"],
        (result) => {
          console.log("Retrieved processing state:", result)

          if (result.processingActive) {
            console.log("Processing was active, resuming at index:", result.currentProcessingIndex)

            // Determine which tab to use
            let tabToUse = null

            // If we have a captcha tab ID, try to use that tab
            if (result.captchaTabId) {
              console.log("Will try to use captcha tab ID:", result.captchaTabId)
              tabToUse = result.captchaTabId
            }
            // If no captcha tab or current tab, create a new tab
            else if (result.currentProcessingTab) {
              console.log("Will try to use current processing tab:", result.currentProcessingTab)
              tabToUse = result.currentProcessingTab
            }

            if (tabToUse) {
              // Try to check if the tab exists
              chrome.tabs.get(tabToUse, (tab) => {
                if (chrome.runtime.lastError) {
                  console.log("Tab no longer exists, creating new tab:", chrome.runtime.lastError)
                  continueWithNewTab()
                } else {
                  console.log("Tab exists, will use it to continue processing")
                  continueWithExistingTab(tab.id)
                }
              })
            } else {
              console.log("No tab to use, creating new tab")
              continueWithNewTab()
            }
          } else {
            console.log("Processing was not active, nothing to resume")
          }
        },
      )
    },
  )

  function continueWithExistingTab(tabId) {
    chrome.storage.local.get(["currentProcessingIndex", "csvProcessingData"], (result) => {
      if (result.csvProcessingData && result.csvProcessingData.data) {
        const csvData = result.csvProcessingData.data
        const currentIndex = result.currentProcessingIndex

        if (currentIndex < csvData.length) {
          const record = csvData[currentIndex]
          console.log("Continuing with existing tab, navigating to:", record._tpsSearchUrl)

          // Update the tab with the next URL
          chrome.tabs.update(tabId, { url: record._tpsSearchUrl, active: true })
        }
      }
    })
  }

  function continueWithNewTab() {
    // Continue with the next record in a new tab
    chrome.storage.local.get(["csvProcessingData", "currentProcessingIndex"], (result) => {
      if (result.csvProcessingData && result.csvProcessingData.data) {
        const csvData = result.csvProcessingData.data
        const currentIndex = result.currentProcessingIndex

        if (currentIndex < csvData.length) {
          const record = csvData[currentIndex]
          console.log("Creating new tab to continue processing, URL:", record._tpsSearchUrl)

          // Create a new tab
          chrome.tabs.create({ url: record._tpsSearchUrl, active: true }, (tab) => {
            // Store the tab ID for later use
            chrome.storage.local.set({
              currentProcessingTab: tab.id,
            })
          })
        }
      }
    })
  }
}

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log("TruePeopleSearch Scraper extension installed.")

  // Clear any proxy settings on installation
  if (chrome.proxy && chrome.proxy.settings) {
    chrome.proxy.settings.clear({ scope: "regular" }, () => {
      console.log("Cleared proxy settings on installation")
    })
  }
})

// Track opened tabs for CSV processing
let openedTabs = []

// Function to close a tab by ID
function closeTab(tabId) {
  chrome.tabs.remove(tabId, () => {
    if (chrome.runtime.lastError) {
      console.error("Error closing tab:", chrome.runtime.lastError)
    } else {
      console.log("Closed tab:", tabId)
      // Remove the tab from our tracking array
      openedTabs = openedTabs.filter((id) => id !== tabId)
    }
  })
}

// Update the tab update listener to detect proxy blocking
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check if this is a TruePeopleSearch profile page or search results page
  if (changeInfo.status === "complete" && tab.url) {
    // Check if this is a Cloudflare CAPTCHA page - be more specific with URL patterns
    if (
      tab.url.includes("truepeoplesearch.com") &&
      (tab.url.includes("InternalCaptcha") ||
        tab.url.includes("__cf_chl_captcha") ||
        tab.url.includes("/captcha?") ||
        tab.url.includes("challenge-platform"))
    ) {
      console.log("Detected potential CAPTCHA page in tab update:", tab.url)

      // Mark this as a CAPTCHA tab
      chrome.storage.local.set({
        captchaDetected: true,
        captchaTabId: tabId,
        processingPausedForCaptcha: true,
        captchaDetectedTime: Date.now(),
        captchaUrl: tab.url,
      })

      // The content script will handle showing the notification
    } else if (tab.url.includes("truepeoplesearch.com/find/person/")) {
      // This is a profile page
      // Check if we're processing a CSV file
      chrome.storage.local.get(
        ["currentProcessingTab", "processingActive", "previousProcessingTab", "processingPausedForCaptcha"],
        (result) => {
          if (result.processingActive && tabId === result.currentProcessingTab && !result.processingPausedForCaptcha) {
            // This is a profile page that was opened as part of CSV processing
            console.log("Processing profile page for CSV data:", tab.url)

            // Close the previous tab if it exists and is different from the current tab
            if (result.previousProcessingTab && result.previousProcessingTab !== tabId) {
              setTimeout(() => closeTab(result.previousProcessingTab), 2000)
            }

            // The content script will handle scraping the data
          }
        },
      )
    } else if (tab.url.includes("truepeoplesearch.com/results")) {
      // This is a search results page
      // Check if we're processing a CSV file
      chrome.storage.local.get(
        ["currentProcessingTab", "processingActive", "previousProcessingTab", "processingPausedForCaptcha"],
        (result) => {
          if (result.processingActive && tabId === result.currentProcessingTab && !result.processingPausedForCaptcha) {
            // This is a search results page that was opened as part of CSV processing
            console.log("Search results page for CSV processing:", tab.url)

            // Close the previous tab if it exists and is different from the current tab
            if (result.previousProcessingTab && result.previousProcessingTab !== tabId) {
              setTimeout(() => closeTab(result.previousProcessingTab), 2000)
            }

            // Inject a script to help the user select the correct profile
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              function: () => {
                // Add a notification to help the user
                const notification = document.createElement("div")
                notification.style.position = "fixed"
                notification.style.top = "10px"
                notification.style.left = "50%"
                notification.style.transform = "translateX(-50%)"
                notification.style.backgroundColor = "#FF9800"
                notification.style.color = "white"
                notification.style.padding = "10px 20px"
                notification.style.borderRadius = "5px"
                notification.style.zIndex = "9999"
                notification.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)"
                notification.style.fontSize = "14px"
                notification.textContent = "Please click on the correct profile to continue CSV processing"

                document.body.appendChild(notification)

                // Remove the notification after 15 seconds
                setTimeout(() => {
                  notification.remove()
                }, 15000)
              },
            })
          }
        },
      )
    }
  }

  // Check for proxy blocking indicators
  if (changeInfo.status === "complete" && tab.url) {
    // Common proxy blocking indicators in the page content
    if (tab.url.includes("truepeoplesearch.com")) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        function: () => {
          // Check for common proxy blocking indicators
          const pageText = document.body.innerText.toLowerCase()
          const proxyBlockedIndicators = [
            "sorry, you have been blocked",
            "access denied",
            "your ip has been blocked",
            "your access to this site has been limited",
            "you have been blocked",
            "your connection has been blocked",
            "proxy error",
            "too many requests",
            "rate limit exceeded",
            "please try again later",
            "automated access",
            "suspicious activity",
            "security check",
          ]

          const isProxyBlocked = proxyBlockedIndicators.some((indicator) => pageText.includes(indicator))

          if (isProxyBlocked) {
            // Notify background script that the proxy is blocked
            chrome.runtime.sendMessage({
              type: "proxy_blocked",
              url: window.location.href,
            })
          }
        },
      })
    }
  }
})

// Replace the onAuthRequired listener with this improved version
chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    console.log("Auth required for: ", details.url, "isProxy:", details.isProxy)

    if (details.isProxy) {
      // Get proxy credentials from storage
      chrome.storage.local.get(["currentProxy", "proxyCredentials"], (result) => {
        let username = ""
        let password = ""

        // First try to get credentials from proxyCredentials
        if (result.proxyCredentials && result.proxyCredentials.username && result.proxyCredentials.password) {
          username = result.proxyCredentials.username
          password = result.proxyCredentials.password
          console.log("Using credentials from proxyCredentials")
        }
        // Fall back to currentProxy if needed
        else if (result.currentProxy && result.currentProxy.username && result.currentProxy.password) {
          username = result.currentProxy.username
          password = result.currentProxy.password
          console.log("Using credentials from currentProxy")
        }

        if (username && password) {
          console.log(`Providing proxy authentication for ${details.url} with username: ${username}`)
          callback({
            authCredentials: {
              username: username,
              password: password,
            },
          })
        } else {
          console.error("No proxy credentials available. Authentication will fail.")
          // Still attempt authentication with empty credentials rather than canceling
          // This allows the request to proceed and potentially work with proxies that don't require auth
          callback({
            authCredentials: {
              username: "",
              password: "",
            },
          })
        }
      })
      return true // Keep the message channel open for the async response
    }
    return false // Let Chrome handle non-proxy auth
  },
  { urls: ["<all_urls>"] },
  ["asyncBlocking"],
)

// Add this function to properly register the proxy authentication handler
function setupProxyAuthHandler() {
  console.log("Setting up proxy authentication handler")

  // Remove any existing listeners to avoid duplicates
  if (chrome.webRequest.onAuthRequired.hasListeners()) {
    console.log("Auth handler already set up")
    return
  }

  // Register the auth handler with the correct parameters
  chrome.webRequest.onAuthRequired.addListener(
    (details, callback) => {
      console.log("Auth required for: ", details.url, "isProxy:", details.isProxy)

      if (details.isProxy) {
        // Get proxy credentials from storage
        chrome.storage.local.get(["currentProxy", "proxyCredentials"], (result) => {
          let username = ""
          let password = ""

          // First try to get credentials from proxyCredentials
          if (result.proxyCredentials && result.proxyCredentials.username && result.proxyCredentials.password) {
            username = result.proxyCredentials.username
            password = result.proxyCredentials.password
            console.log("Using credentials from proxyCredentials")
          }
          // Fall back to currentProxy if needed
          else if (result.currentProxy && result.currentProxy.username && result.currentProxy.password) {
            username = result.currentProxy.username
            password = result.currentProxy.password
            console.log("Using credentials from currentProxy")
          }

          if (username && password) {
            console.log(`Providing proxy authentication for ${details.url} with username: ${username}`)
            callback({
              authCredentials: {
                username: username,
                password: password,
              },
            })
          } else {
            console.error("No proxy credentials available. Authentication will fail.")
            // Still attempt authentication with empty credentials rather than canceling
            callback({
              authCredentials: {
                username: "",
                password: "",
              },
            })
          }
        })
        return true // Keep the message channel open for the async response
      }
      return false // Let Chrome handle non-proxy auth
    },
    { urls: ["<all_urls>"] },
    ["asyncBlocking"], // This is the critical third argument
  )

  console.log("Proxy authentication handler set up successfully")
}

// Add a debug function to check proxy settings
function debugProxySettings() {
  chrome.proxy.settings.get({}, (settings) => {
    console.log("Current proxy settings:", settings)
  })

  chrome.storage.local.get(["currentProxy", "proxyCredentials"], (result) => {
    console.log("Current proxy credentials:", {
      currentProxy: result.currentProxy
        ? {
            host: result.currentProxy.host,
            port: result.currentProxy.port,
            username: result.currentProxy.username ? "provided" : "missing",
            password: result.currentProxy.password ? "provided" : "missing",
          }
        : "none",
      proxyCredentials: result.proxyCredentials
        ? {
            username: result.proxyCredentials.username ? "provided" : "missing",
            password: result.proxyCredentials.password ? "provided" : "missing",
          }
        : "none",
    })
  })
}

// Call the debug function when applying a proxy
const originalApplyAndTrackProxy = applyAndTrackProxy
applyAndTrackProxy = async (proxy) => {
  const result = await originalApplyAndTrackProxy(proxy)
  debugProxySettings()
  return result
}

// Add a listener for proxy errors
chrome.proxy.onProxyError.addListener((details) => {
  console.error("Proxy error:", details)
})

// Call setupProxyAuthHandler immediately to ensure it's registered
setupProxyAuthHandler()

// Add debug call on startup
chrome.runtime.onStartup.addListener(() => {
  debugProxySettings()
})

// Also debug on installation
chrome.runtime.onInstalled.addListener(() => {
  console.log("TruePeopleSearch Scraper extension installed.")
  debugProxySettings()

  // Set up the proxy authentication handler
  setupProxyAuthHandler()

  // Clear any proxy settings on installation
  if (chrome.proxy && chrome.proxy.settings) {
    chrome.proxy.settings.clear({ scope: "regular" }, () => {
      console.log("Cleared proxy settings on installation")
    })
  }
})

// Add a listener for messages from the CSV uploader
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "open_url") {
    console.log("Background script received request to open URL:", message.url)

    chrome.tabs.create({ url: message.url, active: true }, (tab) => {
      if (chrome.runtime.lastError) {
        console.error("Error creating tab:", chrome.runtime.lastError)
        sendResponse({ success: false, error: chrome.runtime.lastError.message })
      } else {
        console.log("Created tab with ID:", tab.id)
        sendResponse({ success: true, tabId: tab.id })
      }
    })

    return true // Keep the message channel open for the async response
  }
})