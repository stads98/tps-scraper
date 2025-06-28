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
function showProxyStatus(proxy) {
  // Remove any existing proxy status indicator
  const existingStatus = document.getElementById("tps-proxy-status")
  if (existingStatus) {
    existingStatus.remove()
  }

  // Create a new status indicator
  const statusElement = document.createElement("div")
  statusElement.id = "tps-proxy-status"
  statusElement.style.position = "fixed"
  statusElement.style.bottom = "10px"
  statusElement.style.right = "10px"
  statusElement.style.backgroundColor = proxy ? "#2196F3" : "#F44336"
  statusElement.style.color = "white"
  statusElement.style.padding = "8px 12px"
  statusElement.style.borderRadius = "4px"
  statusElement.style.fontSize = "12px"
  statusElement.style.fontWeight = "bold"
  statusElement.style.zIndex = "9999"
  statusElement.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)"

  if (proxy) {
    statusElement.textContent = `Proxy: ${proxy.host}:${proxy.port}`
  } else {
    statusElement.textContent = "No Proxy Active"
  }

  document.body.appendChild(statusElement)

  // Auto-hide after 10 seconds
  setTimeout(() => {
    if (statusElement.parentNode) {
      statusElement.style.opacity = "0.5"
    }
  }, 10000)
}

// Add this code to handle proxy change messages
if (typeof chrome !== "undefined" && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "proxy_changed") {
      console.log("Received proxy change notification:", message.proxy)
      showProxyStatus(message.proxy)
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
          showProxyStatus(result.currentProxy)
        } else {
          showProxyStatus(null)
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

  // Rest of the original content script follows...

  // Helper function to safely extract text from a selector
  function extractText(selector, fallback = "") {
    try {
      const element = document.querySelector(selector)
      return element ? element.innerText.trim() : fallback
    } catch (error) {
      console.error(`Error extracting text from ${selector}:`, error)
      return fallback
    }
  }

  // Helper function to extract data using multiple possible selectors
  function extractWithFallbacks(selectors, fallback = "") {
    for (const selector of selectors) {
      const text = extractText(selector)
      if (text && text !== "") {
        return text
      }
    }
    return fallback
  }

  // Add a function to check if we're processing a CSV file
  function checkForCSVProcessing() {
    // Check if chrome is defined
    if (typeof chrome === "undefined" && typeof chrome.runtime !== "undefined") {
      chrome.storage.local.get(["currentProcessingTab", "processingActive"], (result) => {
        if (result.processingActive) {
          // We're processing a CSV file, show a notification
          const notification = document.createElement("div")
          notification.style.position = "fixed"
          notification.style.top = "10px"
          notification.style.left = "50%"
          notification.style.transform = "translateX(-50%)"
          notification.style.backgroundColor = "#2196F3"
          notification.style.color = "white"
          notification.style.padding = "10px 20px"
          notification.style.borderRadius = "5px"
          notification.style.zIndex = "9999"
          notification.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)"
          notification.style.fontSize = "14px"
          notification.textContent = "CSV Processing: Click on the correct profile to scrape data"

          document.body.appendChild(notification)

          // Remove the notification after 10 seconds
          setTimeout(() => {
            notification.remove()
          }, 10000)
        }
      })
    }
  }

  // Check if we're processing a CSV file when the page loads
  window.addEventListener("load", checkForCSVProcessing)

  // Grab data elements from the page
  const nameElement = document.querySelector("#personDetails > div:nth-child(1) > div > h1")
  let name = nameElement?.innerText || "N/A"
  const locationElement = document.querySelector("#personDetails > div:nth-child(1) > div > span:nth-child(5)")
  const location = locationElement ? locationElement.textContent.replace("Lives in ", "").trim() : "N/A"

  // Extract the current address
  const addressElement = document.querySelector(
    "#personDetails > div:nth-child(7) > div.col-12.col-sm-11.pl-sm-1 > div.row.pl-sm-2 > div > div:nth-child(1) > a",
  )
  const address = addressElement ? addressElement.innerText.trim() : "N/A" // Get the address or set to "N/A"

  // Parse and adjust the name format
  const nameParts = name.split(" ")
  if (nameParts.length === 1) {
    name = `${nameParts[0]}, N/A` // Single word treated as first name only
  } else if (nameParts.length === 2 && nameParts[1].length === 1) {
    name = `${nameParts[0]}, N/A` // Treat middle initial as missing last name
  } else {
    name = nameParts.join(" ") // Use the full name if it's complete
  }

  // Function to get the first valid phone number from a list of selectors
  function getPhoneNumber(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector)
      if (element) {
        return element.innerText.trim() // Return the first valid number found
      }
    }
    return "N/A" // Return "N/A" if no valid number is found
  }

  // Define selectors for mobile phone numbers
  const mobilePhoneSelectors = [
    "#personDetails > div:nth-child(7) > div.col-12.col-sm-11.pl-sm-1 > div:nth-child(2) > div:nth-child(1) > div > a > span",
    "#personDetails > div:nth-child(9) > div.col-12.col-sm-11.pl-sm-1 > div:nth-child(2) > div:nth-child(1) > div > a > span",
    // Add any other selectors you want to check here
  ]

  // Extract phone numbers and types
  const phoneNumbers = [
    {
      number:
        document.querySelector(
          "#personDetails > div:nth-child(9) > div:nth-child(2) > div:nth-child(2) > div:nth-child(1) > div > a > span",
        )?.innerText || "N/A",
      type:
        document.querySelector(
          "#personDetails > div:nth-child(9) > div:nth-child(2) > div:nth-child(2) > div:nth-child(1) > div > span",
        )?.innerText || "N/A",
    },
    {
      number:
        document.querySelector(
          "#personDetails > div:nth-child(9) > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div > a > span",
        )?.innerText || "N/A",
      type:
        document.querySelector(
          "#personDetails > div:nth-child(9) > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div > span",
        )?.innerText || "N/A",
    },
    {
      number:
        document.querySelector(
          "#personDetails > div:nth-child(9) > div:nth-child(2) > div:nth-child(3) > div:nth-child(1) > div > a > span",
        )?.innerText || "N/A",
      type:
        document.querySelector(
          "#personDetails > div:nth-child(9) > div:nth-child(2) > div:nth-child(3) > div:nth-child(1) > div > span",
        )?.innerText || "N/A",
    },
    {
      number:
        document.querySelector(
          "#personDetails > div:nth-child(9) > div:nth-child(2) > div:nth-child(3) > div:nth-child(2) > div > a > span",
        )?.innerText || "N/A",
      type:
        document.querySelector(
          "#personDetails > div:nth-child(9) > div:nth-child(2) > div:nth-child(3) > div:nth-child(2) > div > span",
        )?.innerText || "N/A",
    },
    // Add the mobile phone number using the function
    {
      number: getPhoneNumber(mobilePhoneSelectors),
      type: "Mobile", // Assuming this is a mobile number
    },
  ]

  // Extract emails by looping through possible child elements
  const possibleEmailDivs = [11, 12, 13] // Possible indices for email elements
  let emails = []
  const unwantedEmails = new Set(["support@truepeoplesearch.com"]) // Set of unwanted emails

  // Loop through the possible child indices
  possibleEmailDivs.forEach((index) => {
    // Check for the first email element
    const emailElement1 = document.querySelector(
      `#personDetails > div:nth-child(${index}) > div.col-12.col-sm-11.pl-sm-1 > div:nth-child(2) > div > div`,
    )
    if (emailElement1) {
      const emailText1 = emailElement1.innerText.trim()
      if (emailText1.includes("@") && !unwantedEmails.has(emailText1) && !emails.includes(emailText1)) {
        emails.push(emailText1)
      }
    }

    // Check for the second email element
    const emailElement2 = document.querySelector(
      `#personDetails > div:nth-child(${index}) > div.col-12.col-sm-11.pl-sm-1 > div:nth-child(3) > div > div`,
    )
    if (emailElement2) {
      const emailText2 = emailElement2.innerText.trim()
      if (emailText2.includes("@") && !unwantedEmails.has(emailText2) && !emails.includes(emailText2)) {
        emails.push(emailText2)
      }
    }

    // Check for the third email element
    const emailElement3 = document.querySelector(
      `#personDetails > div:nth-child(${index}) > div.col-12.col-sm-11.pl-sm-1 > div:nth-child(4) > div > div`,
    )
    if (emailElement3) {
      const emailText3 = emailElement3.innerText.trim()
      if (emailText3.includes("@") && !unwantedEmails.has(emailText3) && !emails.includes(emailText3)) {
        emails.push(emailText3)
      }
    }
  })

  // Limit to the first three unique emails
  emails = emails.slice(0, 3)

  // Filter wireless numbers and shift them to the left
  const filteredNumbers = phoneNumbers
    .filter((phone) => phone.type === "Wireless") // Keep only wireless numbers
    .map((phone) => phone.number) // Extract the number

  // Ensure the result has exactly 4 slots, filling missing numbers with "N/A"
  while (filteredNumbers.length < 4) {
    filteredNumbers.push("N/A")
  }

  // Parse location into city and state
  let city = "",
    state = ""
  if (location && location !== "N/A") {
    const parts = location.split(", ")
    city = parts[0] || ""
    state = parts[1] || ""
  }

  // Prepare data for storage
  const data = {
    Name: name || "", // Return empty string if name is missing
    Location: location || "", // Return empty string if location is missing
    City: city,
    State: state,
    Address: address || "",
    Phone1: filteredNumbers[0] || "", // Return empty string if missing
    Phone2: filteredNumbers[1] || "", // Return empty string if missing
    Phone3: filteredNumbers[2] || "", // Return empty string if missing
    Phone4: filteredNumbers[3] || "", // Return empty string if missing
    Email1: emails[0] || "", // First email
    Email2: emails[1] || "", // Second email
    Email3: emails[2] || "", // Third email
    ScrapedAt: new Date().toISOString(),
  }

  console.log("Scraped data:", data)

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