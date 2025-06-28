document.addEventListener("DOMContentLoaded", () => {
  const contactCountElement = document.getElementById("contact-count")
  const lastUpdatedElement = document.getElementById("last-updated")
  const statusElement = document.getElementById("status")
  const loadingElement = document.getElementById("loading")
  const exportButton = document.getElementById("export-btn")
  const clearButton = document.getElementById("clear-btn")
  const csvButton = document.getElementById("csv-btn")
  const captchaDelaySelect = document.getElementById("captcha-delay")
  const exportProcessedCsvButton = document.getElementById("export-processed-csv-btn")
  const disconnectProxyButton = document.getElementById("disconnect-proxy-btn")

  // Function to show loading state
  function showLoading() {
    loadingElement.style.display = "block"
    exportButton.disabled = true
    clearButton.disabled = true
    csvButton.disabled = true
    exportProcessedCsvButton.disabled = true
    disconnectProxyButton.disabled = true
  }

  // Function to hide loading state
  function hideLoading() {
    loadingElement.style.display = "none"
    exportButton.disabled = false
    clearButton.disabled = false
    csvButton.disabled = false
    exportProcessedCsvButton.disabled = false
    disconnectProxyButton.disabled = false
  }

  // Function to show status message
  function showStatus(message, isError = false) {
    statusElement.textContent = message
    statusElement.style.color = isError ? "#f44336" : "#4CAF50"

    // Clear status after 3 seconds
    setTimeout(() => {
      statusElement.textContent = ""
    }, 3000)
  }

  // Load CAPTCHA settings
  chrome.runtime.sendMessage({ type: "get_captcha_settings" }, (response) => {
    if (response && response.captchaRetryDelay) {
      captchaDelaySelect.value = response.captchaRetryDelay.toString()
    }
  })

  // Save CAPTCHA settings when changed
  captchaDelaySelect.addEventListener("change", () => {
    chrome.runtime.sendMessage({
      type: "set_captcha_settings",
      captchaRetryDelay: Number.parseInt(captchaDelaySelect.value),
    })
  })

  // Check for active CAPTCHA
  chrome.storage.local.get(["processingPausedForCaptcha", "captchaDetectedTime"], (result) => {
    if (result.processingPausedForCaptcha) {
      const captchaTime = new Date(result.captchaDetectedTime || Date.now())
      const timeAgo = Math.floor((Date.now() - captchaTime) / 60000) // minutes

      showStatus(`CAPTCHA detected ${timeAgo} min ago. Please solve it to continue.`, true)
    }
  })

  // Function to update the UI with current data
  function updateUI() {
    // Get the stored data and update the contact count
    chrome.storage.local.get(["scrapedData", "csvProcessingData"], (result) => {
      const scrapedData = result.scrapedData || []
      const contactCount = scrapedData.length

      // Update contact count
      contactCountElement.innerText = `Contacts Stored: ${contactCount}`

      // Update last updated time if we have data
      if (contactCount > 0 && scrapedData[contactCount - 1].ScrapedAt) {
        const lastUpdated = new Date(scrapedData[contactCount - 1].ScrapedAt)
        const formattedDate = lastUpdated.toLocaleDateString()
        lastUpdatedElement.innerText = `Last: ${formattedDate}`
      } else {
        lastUpdatedElement.innerText = ""
      }

      // Enable/disable export button based on data availability
      exportButton.disabled = contactCount === 0
      exportProcessedCsvButton.disabled = !result.csvProcessingData
    })
  }

  // Update UI when popup opens
  updateUI()

  // Add event listener for export button
  exportButton.addEventListener("click", () => {
    showLoading()

    chrome.runtime.sendMessage({ type: "download_csv" }, (response) => {
      hideLoading()

      if (response?.success) {
        showStatus("Data exported successfully!")
      } else {
        showStatus(`Export failed: ${response?.message || "Unknown error"}`, true)
      }
    })
  })

  // Add event listener for clear button
  clearButton.addEventListener("click", () => {
    const confirmClear = confirm("Are you sure you want to clear all stored data? This action cannot be undone.")

    if (confirmClear) {
      showLoading()

      chrome.runtime.sendMessage({ type: "clear_data" }, (response) => {
        hideLoading()

        if (response?.success) {
          showStatus("Data cleared successfully!")
          updateUI() // Update UI to reflect the cleared data
        } else {
          showStatus("Failed to clear data.", true)
        }
      })
    }
  })

  // Add event listener for CSV button
  csvButton.addEventListener("click", () => {
    // Open the CSV uploader page in a new tab
    chrome.tabs.create({ url: "csv-uploader.html" })
  })

  // Add event listener for the new export processed CSV button
  exportProcessedCsvButton.addEventListener("click", () => {
    showLoading()
    chrome.runtime.sendMessage({ type: "export_processed_csv_from_popup" }, (response) => {
      hideLoading()
      if (response?.success) {
        showStatus("Processed data exported successfully!")
      } else {
        showStatus(`Export failed: ${response?.message || "Unknown error"}`, true)
      }
    })
  })

  // Add event listener for the disconnect proxy button
  disconnectProxyButton.addEventListener("click", () => {
    showLoading()
    chrome.runtime.sendMessage({ type: "disconnect_proxy" }, (response) => {
      hideLoading()
      if (response?.success) {
        showStatus("Proxy disconnected successfully!")
      } else {
        showStatus(`Failed to disconnect proxy: ${response?.message || "Unknown error"}`, true)
      }
    })
  })

  // Check for active tab on TruePeopleSearch
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0]
    if (currentTab && currentTab.url) {
      const url = currentTab.url
      if (url.includes("truepeoplesearch.com/find/person")) {
        statusElement.textContent = "Ready to scrape this profile"
        statusElement.style.color = "#4CAF50"
      }
    }
  })
})