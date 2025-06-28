// Add this function at the beginning of the content script
function detectCloudflareCaptcha() {
  // Check if we're on our own CSV uploader page
  if (localStorage.getItem("tps_on_csv_uploader") === "true") {
    console.log("On CSV uploader page, skipping CAPTCHA detection")
    return false
  }

  // First, check if we're on a TruePeopleSearch page - this prevents false positives on our own extension pages
  if (!window.location.hostname.includes("truepeoplesearch.com")) {
    return false
  }

  // Skip detection on search results pages to avoid false positives
  if (window.location.href.includes("truepeoplesearch.com/results")) {
    return false
  }

  const pageText = document.body.innerText.toLowerCase()
  const hasPressAndHold = pageText.includes("verify you are human") && (pageText.includes("press and hold") || pageText.includes("press & hold"))

  // Strong indicators - these are almost certainly CAPTCHA pages
  const strongIndicators = [
    !!document.getElementById("captchaForm"),
    !!document.querySelector(".h-captcha"),
    !!document.querySelector("[data-sitekey]"),
    !!document.querySelector("[name='cf-turnstile-response']"),
    !!document.querySelector("#cf-chl-widget-frkou_response"),
    !!document.querySelector("[id^='cf-chl-widget']"),
    !!document.querySelector("#manualSubmit"),
    document.title === "Captcha",
    hasPressAndHold,
  ]

  // Check if any strong indicators are present
  const hasStrongIndicator = strongIndicators.some((indicator) => indicator === true)

  // URL patterns specific to CAPTCHA
  const isCaptchaUrl =
    window.location.href.includes("InternalCaptcha") ||
    window.location.href.includes("__cf_chl_") ||
    window.location.href.includes("/captcha")

  // Check for Cloudflare scripts with specific challenge patterns
  const hasCloudflareScript = Array.from(document.scripts).some(
    (script) => script.src && script.src.includes("challenges.cloudflare.com/turnstile/v0/api.js"),
  )

  // Log detection results for debugging
  console.log("CAPTCHA Detection Check:", {
    hostname: window.location.hostname,
    captchaForm: !!document.getElementById("captchaForm"),
    hCaptcha: !!document.querySelector(".h-captcha"),
    turnstileWidget: !!document.querySelector("[data-sitekey]"),
    cfTurnstileResponse: !!document.querySelector("[name='cf-turnstile-response']"),
    cfChlWidget: !!document.querySelector("[id^='cf-chl-widget']"),
    manualSubmit: !!document.querySelector("#manualSubmit"),
    cloudflareScript: hasCloudflareScript,
    isCaptchaTitle: document.title === "Captcha",
    isCaptchaUrl: isCaptchaUrl,
    hasStrongIndicator: hasStrongIndicator,
    hasPressAndHold: hasPressAndHold,
  })

  // For a positive detection, require either:
  // 1. A CAPTCHA-specific URL, or
  // 2. At least one strong indicator AND the Cloudflare script
  return isCaptchaUrl || (hasStrongIndicator && hasCloudflareScript)
}

// Add this function to detect blocked proxies
function detectBlockedProxy() {
  // Check if we're on our own CSV uploader page
  if (localStorage.getItem("tps_on_csv_uploader") === "true") {
    console.log("On CSV uploader page, skipping proxy block detection")
    return false
  }

  // First, check if we're on a TruePeopleSearch page
  if (!window.location.hostname.includes("truepeoplesearch.com")) {
    return false
  }

  // Check for common proxy blocking messages in the page content
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
    "unusual traffic",
    "blocked",
    "403 forbidden",
    "access to this page has been denied",
    "http error 407",
    "this page isn’t working",
  ]

  // Check if any of the blocking indicators are present
  const isBlocked = proxyBlockedIndicators.some((indicator) => pageText.includes(indicator))

  // Also check for specific elements that might indicate blocking
  const hasBlockingElements =
    !!document.querySelector(".cf-error-details") ||
    !!document.querySelector(".cf-error-code") ||
    !!document.querySelector(".cf-error-overview") ||
    !!document.querySelector(".cf-error-type") ||
    (!!document.querySelector("[class*='error']") && pageText.includes("blocked"))

  // Check for empty results that might indicate blocking
  const isEmptyResults =
    window.location.href.includes("truepeoplesearch.com/results") &&
    !document.querySelector(".card-body") &&
    !document.querySelector(".result-container")

  // Log detection results for debugging
  console.log("Proxy Block Detection Check:", {
    hostname: window.location.hostname,
    url: window.location.href,
    isBlocked: isBlocked,
    hasBlockingElements: hasBlockingElements,
    isEmptyResults: isEmptyResults,
    pageTextSample: pageText.substring(0, 200), // Log a sample of the page text
  })

  return isBlocked || hasBlockingElements || isEmptyResults
}

// Update handleCloudflareCaptcha to try auto-clicking first
function handleCloudflareCaptcha() {
  console.log("Cloudflare CAPTCHA detected!")

  // The rest of the original function will run if auto-clicking fails
  // and is called from attemptCaptchaAutoClick
  // Create a notification to alert the user
  const notification = document.createElement("div")
  notification.id = "tps-captcha-notification"
  notification.style.position = "fixed"
  notification.style.top = "10px"
  notification.style.left = "50%"
  notification.style.transform = "translateX(-50%)"
  notification.style.backgroundColor = "#FF5722"
  notification.style.color = "white"
  notification.style.padding = "15px 20px"
  notification.style.borderRadius = "5px"
  notification.style.zIndex = "9999"
  notification.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)"
  notification.style.fontSize = "16px"
  notification.style.fontWeight = "bold"
  notification.style.textAlign = "center"
  notification.style.maxWidth = "80%"
  notification.innerHTML = `
    <p>⚠️ Cloudflare CAPTCHA detected!</p>
    <p style="font-size: 14px; margin: 5px 0;">Please solve the CAPTCHA manually.</p>
    <p style="font-size: 14px; margin: 5px 0;">The extension will continue automatically after you solve it.</p>
    <p style="font-size: 14px; margin: 5px 0; font-weight: normal;">Processing has been paused.</p>
  `

  document.body.appendChild(notification)

  // Try to find and highlight the checkbox to make it more visible
  setTimeout(() => {
    try {
      const checkbox = document.querySelector("input[type='checkbox']")
      if (checkbox) {
        // Add a highlight around the checkbox
        const parent = checkbox.parentElement
        if (parent) {
          parent.style.border = "3px solid #FF5722"
          parent.style.borderRadius = "5px"
          parent.style.padding = "5px"
          parent.style.backgroundColor = "rgba(255, 87, 34, 0.1)"
        }
      }
    } catch (e) {
      console.error("Error highlighting checkbox:", e)
    }
  }, 1000)

  // Notify the background script that we've encountered a CAPTCHA
  if (typeof chrome !== "undefined" && typeof chrome.runtime !== "undefined") {
    chrome.runtime.sendMessage({
      type: "cloudflare_captcha_detected",
      url: window.location.href,
    })
  }

  // We'll check for CAPTCHA solution in multiple ways
  startCaptchaSolutionDetection(notification)
}

// Add a function to handle blocked proxy notification
function handleBlockedProxy() {
  console.log("Proxy blocked detected!")

  // Get the current proxy from storage
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.get(["currentProxy"], (result) => {
      const proxyInfo = result.currentProxy ? `${result.currentProxy.host}:${result.currentProxy.port}` : "Unknown"

      // Create a notification to alert the user
      const notification = document.createElement("div")
      notification.id = "tps-proxy-blocked-notification"
      notification.style.position = "fixed"
      notification.style.top = "10px"
      notification.style.left = "50%"
      notification.style.transform = "translateX(-50%)"
      notification.style.backgroundColor = "#F44336"
      notification.style.color = "white"
      notification.style.padding = "15px 20px"
      notification.style.borderRadius = "5px"
      notification.style.zIndex = "9999"
      notification.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)"
      notification.style.fontSize = "16px"
      notification.style.fontWeight = "bold"
      notification.style.textAlign = "center"
      notification.style.maxWidth = "80%"
      notification.innerHTML = `
        <p>⚠️ Proxy has been blocked!</p>
        <p style="font-size: 14px; margin: 5px 0;">Proxy: ${proxyInfo}</p>
        <p style="font-size: 14px; margin: 5px 0;">Changing to a new proxy and retrying...</p>
      `

      document.body.appendChild(notification)

      // Notify the background script that the proxy has been blocked
      if (typeof chrome !== "undefined" && typeof chrome.runtime !== "undefined") {
        chrome.runtime.sendMessage({
          type: "proxy_blocked",
          url: window.location.href,
          proxy: result.currentProxy,
        })
      }

      // Remove the notification after 5 seconds
      setTimeout(() => {
        if (notification && notification.parentNode) {
          notification.remove()
        }
      }, 5000)
    })
  }
}

// Add a new function to improve CAPTCHA solution detection
function startCaptchaSolutionDetection(notification) {
  console.log("Starting CAPTCHA solution detection")
  const initialUrl = window.location.href

  // Method 1: Mutation observer to detect when CAPTCHA elements are removed
  const observer = new MutationObserver((mutations) => {
    if (!detectCloudflareCaptcha()) {
      console.log("CAPTCHA no longer detected through mutation observer")
      cleanupAfterCaptchaSolved(observer, urlCheckInterval, notification)
    }
  })

  // Start observing the document with the configured parameters
  observer.observe(document.body, { childList: true, subtree: true, attributes: true })

  // Method 2: Check for URL changes which might indicate CAPTCHA was solved
  const urlCheckInterval = setInterval(() => {
    if (window.location.href !== initialUrl) {
      console.log("URL changed, indicating CAPTCHA solution")
      cleanupAfterCaptchaSolved(observer, urlCheckInterval, notification)
    }

    // Method 3: Check if CAPTCHA elements are no longer present
    if (!detectCloudflareCaptcha()) {
      console.log("CAPTCHA elements no longer detected in interval check")
      cleanupAfterCaptchaSolved(observer, urlCheckInterval, notification)
    }
  }, 1000)

  // Method 4: Monitor network requests for successful responses
  if (window.PerformanceObserver) {
    try {
      const perfObserver = new PerformanceObserver((entries) => {
        entries.getEntries().forEach((entry) => {
          if (entry.initiatorType === "xmlhttprequest" || entry.initiatorType === "fetch") {
            // Check for successful responses to Cloudflare endpoints
            if (entry.name.includes("cloudflare") && entry.duration > 0) {
              console.log("Detected network request to Cloudflare:", entry)
              // Wait a bit to see if the page updates
              setTimeout(() => {
                if (!detectCloudflareCaptcha()) {
                  console.log("CAPTCHA no longer detected after Cloudflare network request")
                  cleanupAfterCaptchaSolved(observer, urlCheckInterval, notification)
                  perfObserver.disconnect()
                }
              }, 1500)
            }
          }
        })
      })
      perfObserver.observe({ entryTypes: ["resource"] })

      // Clean up this observer after 2 minutes to avoid memory leaks
      setTimeout(() => {
        perfObserver.disconnect()
      }, 120000)
    } catch (e) {
      console.error("Error setting up PerformanceObserver:", e)
    }
  }
}

// Add a new function to handle cleanup and notification when CAPTCHA is solved
function cleanupAfterCaptchaSolved(observer, interval, notification) {
  // Disconnect observers and clear intervals
  observer.disconnect()
  clearInterval(interval)

  // Remove notification if it still exists
  if (notification && notification.parentNode) {
    notification.remove()
  } else {
    // Try to find by ID in case the reference was lost
    const notificationElement = document.getElementById("tps-captcha-notification")
    if (notificationElement) {
      notificationElement.remove()
    }
  }

  // Show success notification
  const successNotification = document.createElement("div")
  successNotification.style.position = "fixed"
  successNotification.style.top = "10px"
  successNotification.style.left = "50%"
  successNotification.style.transform = "translateX(-50%)"
  successNotification.style.backgroundColor = "#4CAF50"
  successNotification.style.color = "white"
  successNotification.style.padding = "10px 20px"
  successNotification.style.borderRadius = "5px"
  successNotification.style.zIndex = "9999"
  successNotification.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)"
  successNotification.textContent = "CAPTCHA solved! Processing will resume..."
  document.body.appendChild(successNotification)

  // Remove the success notification after 3 seconds
  setTimeout(() => {
    successNotification.remove()
  }, 3000)

  // Notify the background script that the CAPTCHA is solved
  if (typeof chrome !== "undefined" && typeof chrome.runtime !== "undefined") {
    chrome.runtime.sendMessage({
      type: "cloudflare_captcha_solved",
      url: window.location.href,
    })
  }
}

// Add this function to show the current proxy status
function showProxyPopup(proxy) {
  // Remove any existing proxy status indicator
  const existingStatus = document.getElementById("tps-proxy-status-popup")
  if (existingStatus) {
    existingStatus.remove()
  }

  // Create a new status indicator
  const statusElement = document.createElement("div")
  statusElement.id = "tps-proxy-status-popup"
  statusElement.style.position = "fixed"
  statusElement.style.top = "20px"
  statusElement.style.left = "50%"
  statusElement.style.transform = "translateX(-50%)"
  statusElement.style.backgroundColor = proxy ? "rgba(33, 150, 243, 0.9)" : "rgba(244, 67, 54, 0.9)"
  statusElement.style.color = "white"
  statusElement.style.padding = "12px 20px"
  statusElement.style.borderRadius = "8px"
  statusElement.style.fontSize = "14px"
  statusElement.style.fontWeight = "bold"
  statusElement.style.zIndex = "10000"
  statusElement.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)"
  statusElement.style.transition = "opacity 0.5s ease-out"

  if (proxy) {
    statusElement.textContent = `Using Proxy: ${proxy.host}:${proxy.port}`
  } else {
    statusElement.textContent = "No Proxy Active"
  }

  document.body.appendChild(statusElement)

  // Auto-hide after 4 seconds
  setTimeout(() => {
    statusElement.style.opacity = "0"
    setTimeout(() => {
      if (statusElement.parentNode) {
        statusElement.remove()
      }
    }, 500) // wait for fade out transition
  }, 4000)
}

// Add this code to handle proxy change messages
if (typeof chrome !== "undefined" && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "proxy_changed") {
      console.log("Received proxy change notification:", message.proxy)
      showProxyPopup(message.proxy)
      sendResponse({ success: true })
    }
    return true
  })
}

// Add this code to check and display the current proxy when the page loads
window.addEventListener("load", () => {
  // Check if we're on a TruePeopleSearch page
  if (window.location.hostname.includes("truepeoplesearch.com")) {
    // Get the current proxy from storage
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(["currentProxy"], (result) => {
        if (result.currentProxy) {
          showProxyPopup(result.currentProxy)
        } else {
          showProxyPopup(null)
        }
      })
    }
  }
})
// Add this code at the beginning of the IIFE to check for CAPTCHA before doing anything else
;(() => {
  // Declare chrome variable if it's not already defined
  if (typeof chrome === "undefined") {
    var chrome = window.chrome || {}
  }

  // Check for Cloudflare CAPTCHA first
  if (detectCloudflareCaptcha()) {
    handleCloudflareCaptcha()
    return // Exit early and don't try to scrape data
  }

  // Check for blocked proxy
  if (detectBlockedProxy()) {
    handleBlockedProxy()
    return // Exit early and don't try to scrape data
  }

  // --- NEW ROBUST SCRAPING LOGIC ---

  // Helper function to find a section container by its header text
  function findSectionContainer(headerText) {
    const headers = Array.from(document.querySelectorAll("h2, h3, h4, .card-header, .report-header"))
    const targetHeader = headers.find((h) => h.innerText.trim().toLowerCase() === headerText.toLowerCase())

    if (targetHeader) {
      // Find the closest common ancestor that acts as a container for the section
      return targetHeader.closest(".card, .report-block")
    }
    return null
  }

  // --- Scrape Basic Info ---
  const nameElement = document.querySelector('h1[itemprop="name"]')
  const name = nameElement ? nameElement.innerText.trim() : "N/A"

  const locationElement = document.querySelector('span[itemprop="addressLocality"]')
  const location = locationElement ? locationElement.innerText.trim() : "N/A"

  // --- Scrape Address ---
  let address = "N/A"
  const addressSection = findSectionContainer("Current Address")
  if (addressSection) {
    const addressLink = addressSection.querySelector('a[href*="/address/"]')
    if (addressLink) {
      // The address is often split into multiple lines within the link
      address = Array.from(addressLink.childNodes)
        .map((node) => (node.nodeType === Node.TEXT_NODE ? node.textContent.trim() : ""))
        .filter(Boolean)
        .join(", ")
    }
  }

  // --- Scrape Phone Numbers (Wireless Only) ---
  let wirelessPhones = []
  const phoneSection = findSectionContainer("Phone Numbers")
  if (phoneSection) {
    const phoneRows = Array.from(phoneSection.querySelectorAll(".row.pl-sm-2 > div"))
    phoneRows.forEach((row) => {
      const typeElement = row.querySelector("span.text-muted")
      if (typeElement && typeElement.innerText.trim().toLowerCase().includes("wireless")) {
        const numberElement = row.querySelector('a[href*="tel:"]')
        if (numberElement) {
          wirelessPhones.push(numberElement.innerText.trim())
        }
      }
    })
  }

  // Fill up to 4 wireless phone numbers, padding with "N/A"
  const finalPhones = []
  for (let i = 0; i < 4; i++) {
    finalPhones.push(wirelessPhones[i] || "N/A")
  }

  // --- Scrape Emails ---
  let emails = []
  const emailSection = findSectionContainer("Email Addresses")
  if (emailSection) {
    const emailElements = Array.from(emailSection.querySelectorAll('a[href*="mailto:"]'))
    emailElements.forEach((el) => {
      const emailText = el.innerText.trim()
      if (emailText && !emailText.toLowerCase().includes("support@truepeoplesearch.com")) {
        emails.push(emailText)
      }
    })
  }
  // Get unique emails and limit to 3
  emails = [...new Set(emails)].slice(0, 3)
  const finalEmails = []
  for (let i = 0; i < 3; i++) {
    finalEmails.push(emails[i] || "N/A")
  }

  // --- Final Data Assembly ---
  let city = ""
  let state = ""
  if (location && location !== "N/A") {
    const parts = location.split(", ")
    city = parts[0] || ""
    state = parts[1] || ""
  }

  const data = {
    Name: name,
    Location: location,
    City: city,
    State: state,
    Address: address,
    Phone1: finalPhones[0],
    Phone2: finalPhones[1],
    Phone3: finalPhones[2],
    Phone4: finalPhones[3],
    Email1: finalEmails[0],
    Email2: finalEmails[1],
    Email3: finalEmails[2],
    ScrapedAt: new Date().toISOString(),
  }

  console.log("Scraped data (new logic):", data)

  // Send data to background script
  if (typeof chrome !== "undefined" && typeof chrome.runtime !== "undefined") {
    chrome.runtime.sendMessage({ type: "store_data", data }, (response) => {
      if (response?.success) {
        console.log("Data sent to background.js for storage.")

        // Show a visual confirmation to the user
        const notification = document.createElement("div")
        notification.style.position = "fixed"
        notification.style.top = "10px"
        notification.style.right = "10px"
        notification.style.backgroundColor = "green"
        notification.style.color = "white"
        notification.style.padding = "10px"
        notification.style.borderRadius = "5px"
        notification.style.zIndex = "9999"
        notification.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)"
        notification.textContent = "Contact information saved!"

        document.body.appendChild(notification)

        // Remove the notification after 3 seconds
        setTimeout(() => {
          notification.remove()
        }, 3000)
      } else {
        console.error("Failed to send data to background.js:", response?.message || "No response received.")
      }
    })
  } else {
    console.warn("Chrome runtime is not available. The extension may not be running in a Chrome environment.")
  }
})()