document.addEventListener("DOMContentLoaded", () => {
  // Set a flag in localStorage to indicate we're on the CSV uploader page
  // This will help prevent false CAPTCHA detections
  localStorage.setItem("tps_on_csv_uploader", "true")

  // Clear the flag when the page is unloaded
  window.addEventListener("beforeunload", () => {
    localStorage.removeItem("tps_on_csv_uploader")
  })

  // DOM elements
  const fileUploadArea = document.getElementById("fileUploadArea")
  const csvFileInput = document.getElementById("csvFileInput")
  const selectedFileName = document.getElementById("selectedFileName")
  const csvPreviewContainer = document.getElementById("csvPreviewContainer")
  const csvPreviewTable = document.getElementById("csvPreviewTable")
  const mappingStep = document.getElementById("mappingStep")
  const processStep = document.getElementById("processStep")
  const backButton = document.getElementById("backButton")
  const nextButton = document.getElementById("nextButton")
  const startButton = document.getElementById("startButton")
  const exportButton = document.getElementById("exportButton")
  const progressContainer = document.getElementById("progressContainer")
  const progressFill = document.getElementById("progressFill")
  const progressText = document.getElementById("progressText")
  const statusMessage = document.getElementById("statusMessage")
  const delaySlider = document.getElementById("delaySlider")
  const delayValue = document.getElementById("delayValue")

  // Column mapping selects
  const fullNameColumn = document.getElementById("fullNameColumn")
  const firstNameColumn = document.getElementById("firstNameColumn")
  const lastNameColumn = document.getElementById("lastNameColumn")
  const locationColumn = document.getElementById("locationColumn")
  const cityColumn = document.getElementById("cityColumn")
  const stateColumn = document.getElementById("stateColumn")

  // Add ZIP column mapping
  const zipColumn = document.getElementById("zipColumn")
  const locationFormat = document.getElementById("locationFormat")
  const previewStep = document.getElementById("previewStep")
  const mappingPreviewTable = document.getElementById("mappingPreviewTable")
  const previewStatus = document.getElementById("previewStatus")

  // Add these variables for proxy handling
  let proxyData = null
  let proxyChangeRows = 5
  const currentProxyIndex = 0
  const rowsProcessedWithCurrentProxy = 0

  // State variables
  let currentStep = 1
  let csvData = null
  let processedData = null
  let currentProcessingIndex = 0
  let processingActive = false
  let delaySeconds = 5

  // Initialize chrome if it's not defined
  if (typeof chrome === "undefined") {
    window.chrome = {}
  }

  function closeTab(tabId) {
    if (chrome.tabs) {
      chrome.tabs.remove(tabId)
    } else {
      console.log(`closeTab(${tabId}) - chrome.tabs is not available.`)
    }
  }

  // Debug log to check if elements are found
  console.log("File upload elements:", {
    fileUploadArea: fileUploadArea ? "Found" : "Not found",
    csvFileInput: csvFileInput ? "Found" : "Not found",
  })

  // Initialize event listeners
  initEventListeners()

  // Update the initEventListeners function to add proxy and CAPTCHA event listeners
  function initEventListeners() {
    // File upload area click - add direct debugging
    if (fileUploadArea) {
      fileUploadArea.addEventListener("click", (e) => {
        console.log("File upload area clicked")
        // Only trigger file input click if no file has been selected yet
        if (csvFileInput && !csvData) {
          console.log("Triggering click on file input")
          e.stopPropagation() // Stop event propagation
          csvFileInput.click()
        }
      })
    } else {
      console.error("File upload area element not found")
    }

    // Direct click handler for the file input
    if (csvFileInput) {
      console.log("Initializing file input")
      // Don't hide it completely, make it invisible but still functional
      csvFileInput.style.opacity = "0"
      csvFileInput.style.position = "absolute"
      csvFileInput.style.pointerEvents = "none" // Allow clicks to pass through
      csvFileInput.disabled = false // Make sure it's not disabled
    }

    // File upload area drag and drop
    if (fileUploadArea) {
      fileUploadArea.addEventListener("dragover", (e) => {
        e.preventDefault()
        fileUploadArea.classList.add("active")
      })

      fileUploadArea.addEventListener("dragleave", () => {
        fileUploadArea.classList.remove("active")
      })

      fileUploadArea.addEventListener("drop", (e) => {
        e.preventDefault()
        fileUploadArea.classList.remove("active")

        if (e.dataTransfer.files.length) {
          handleFileUpload(e.dataTransfer.files[0])
        }
      })
    }

    // File input change
    if (csvFileInput) {
      csvFileInput.addEventListener("change", (e) => {
        console.log("File input change event triggered")
        if (e.target.files.length) {
          handleFileUpload(e.target.files[0])
        }
      })
    }

    // Delay slider change
    if (delaySlider) {
      delaySlider.addEventListener("input", () => {
        delaySeconds = Number.parseInt(delaySlider.value)
        delayValue.textContent = `${delaySeconds}s`
      })
    }

    // Navigation buttons
    if (backButton) {
      backButton.addEventListener("click", goToPreviousStep)
    }

    if (nextButton) {
      nextButton.addEventListener("click", goToNextStep)
    }

    if (startButton) {
      startButton.addEventListener("click", startProcessing)
    }

    if (exportButton) {
      exportButton.addEventListener("click", exportResults)
    }

    // Load CAPTCHA settings
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage({ type: "get_captcha_settings" }, (response) => {
        if (response && response.captchaRetryDelay) {
          delaySeconds = Math.max(5, Math.floor(response.captchaRetryDelay / 1000))
          delaySlider.value = Math.min(30, delaySeconds)
          delayValue.textContent = `${delaySlider.value}s`
        }
      })

      // Update CAPTCHA settings when delay changes
      if (delaySlider) {
        delaySlider.addEventListener("change", () => {
          chrome.runtime.sendMessage({
            type: "set_captcha_settings",
            captchaRetryDelay: Number(delaySlider.value) * 1000,
          })
        })
      }
    }

    // Add direct upload button event listener
    const directUploadButton = document.getElementById("directUploadButton")
    if (directUploadButton) {
      console.log("Direct upload button found")
      directUploadButton.addEventListener("click", (e) => {
        console.log("Direct upload button clicked")
        e.preventDefault()
        e.stopPropagation()
        // Only trigger file input click if no file has been selected yet
        if (csvFileInput && !csvData) {
          console.log("Triggering click on file input from button")
          csvFileInput.click()
        }
      })
    }

    // Webshare API Key input and button
    const fetchProxiesButton = document.getElementById("fetchProxiesButton")
    if (fetchProxiesButton) {
      fetchProxiesButton.addEventListener("click", fetchProxiesFromWebshare)
    }

    // Proxy change rows input
    const proxyChangeRowsInput = document.getElementById("proxyChangeRows")
    if (proxyChangeRowsInput) {
      proxyChangeRowsInput.addEventListener("change", () => {
        proxyChangeRows = Number.parseInt(proxyChangeRowsInput.value, 10) || 5
      })
    }
  }

  // Function to fetch proxies from Webshare API
  async function fetchProxiesFromWebshare() {
    const apiKeyInput = document.getElementById("webshareApiKey")
    const apiKey = apiKeyInput.value.trim()

    if (!apiKey) {
      showStatus("Please enter your Webshare API key.", "error")
      return
    }

    showStatus("Fetching proxies from Webshare...", "info")

    try {
      const response = await fetch("https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=1&page_size=100", {
        headers: {
          Authorization: `Token ${apiKey}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(`API request failed: ${errorData.detail || response.statusText}`)
      }

      const data = await response.json()

      if (!data.results || data.results.length === 0) {
        showStatus("No proxies found in your Webshare account.", "error")
        return
      }

      // Format proxies for the extension
      proxyData = data.results.map((p) => ({
        host: p.proxy_address,
        port: p.port,
        username: p.username,
        password: p.password,
        blocked: false,
        lastUsed: null,
      }))

      showStatus(`Successfully fetched ${proxyData.length} proxies.`, "success")
      generateProxyPreviewTable(proxyData)

      // Automatically test the first proxy
      if (proxyData.length > 0) {
        testProxy(proxyData[0])
      }
    } catch (error) {
      console.error("Error fetching proxies:", error)
      showStatus(`Error fetching proxies: ${error.message}`, "error")
    }
  }

  // Function to test a proxy
  function testProxy(proxy) {
    if (!proxy) {
      showStatus("No proxy available to test.", "error")
      return
    }

    showStatus(`Testing proxy ${proxy.host}:${proxy.port}...`, "info")

    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage(
        {
          type: "test_proxy",
          proxy: proxy,
        },
        (response) => {
          const proxyPreviewStatus = document.getElementById("proxyPreviewStatus")
          if (response && response.success) {
            proxyPreviewStatus.textContent = `Proxy test successful! IP: ${response.ip}`
            proxyPreviewStatus.className = "status success"
          } else {
            proxyPreviewStatus.textContent = `Proxy test failed: ${response.error || "Unknown error"}`
            proxyPreviewStatus.className = "status error"
          }
          proxyPreviewStatus.style.display = "block"
        },
      )
    } else {
      showStatus("Chrome runtime not available, cannot test proxy.", "error")
    }
  }

  // Function to generate proxy preview table
  function generateProxyPreviewTable(proxies) {
    const proxyPreviewTable = document.getElementById("proxyPreviewTable")
    const proxyPreviewContainer = document.getElementById("proxyPreviewContainer")

    if (!proxyPreviewTable || !proxyPreviewContainer) return

    // Clear existing table
    proxyPreviewTable.innerHTML = ""

    // Create header row
    const headerRow = document.createElement("tr")
    const headers = ["Host", "Port", "Username", "Password"]

    headers.forEach((header) => {
      const th = document.createElement("th")
      th.textContent = header
      headerRow.appendChild(th)
    })

    const thead = document.createElement("thead")
    thead.appendChild(headerRow)
    proxyPreviewTable.appendChild(thead)

    const tbody = document.createElement("tbody")
    // Create data rows for all proxies
    proxies.forEach((proxy) => {
      const tr = document.createElement("tr")

      const tdHost = document.createElement("td")
      tdHost.textContent = proxy.host
      tr.appendChild(tdHost)

      const tdPort = document.createElement("td")
      tdPort.textContent = proxy.port
      tr.appendChild(tdPort)

      const tdUsername = document.createElement("td")
      tdUsername.textContent = proxy.username
      tr.appendChild(tdUsername)

      const tdPassword = document.createElement("td")
      tdPassword.textContent = proxy.password ? "********" : ""
      tr.appendChild(tdPassword)

      tbody.appendChild(tr)
    })
    proxyPreviewTable.appendChild(tbody)

    // Show preview container
    proxyPreviewContainer.classList.remove("hidden")
  }

  async function handleFileUpload(file) {
    console.log("Handling file upload:", file ? file.name : "No file")

    // If we already have data, don't process the file again
    if (csvData) {
      console.log("CSV data already loaded, ignoring new file")
      return
    }

    if (!file || file.type !== "text/csv") {
      showStatus("Please select a valid CSV file", "error")
      return
    }

    // Hide the upload button after successful file selection
    const directUploadButton = document.getElementById("directUploadButton")
    if (directUploadButton) {
      directUploadButton.style.display = "none"
    }

    try {
      // Parse the CSV file
      csvData = await window.csvProcessor.parseCSV(file)
      console.log("CSV data parsed successfully:", csvData.headers)

      // Update UI
      selectedFileName.textContent = file.name
      selectedFileName.classList.remove("hidden")

      // Hide the upload instructions
      const uploadInstructions = document.getElementById("uploadInstructions")
      if (uploadInstructions) {
        uploadInstructions.style.display = "none"
      }

      // Make the file upload area non-clickable
      if (fileUploadArea) {
        fileUploadArea.style.cursor = "default"
        fileUploadArea.style.borderColor = "#4CAF50"
        fileUploadArea.style.backgroundColor = "rgba(76, 175, 80, 0.1)"
      }

      // Generate preview table
      generatePreviewTable()

      // Populate column mapping dropdowns
      populateColumnMappings()

      // Enable next button
      nextButton.disabled = false
    } catch (error) {
      console.error("Error parsing CSV:", error)
      showStatus("Error parsing CSV file: " + error.message, "error")
    }
  }

  function generatePreviewTable() {
    // Clear existing table
    csvPreviewTable.innerHTML = ""

    // Create header row
    const headerRow = document.createElement("tr")
    csvData.headers.forEach((header) => {
      const th = document.createElement("th")
      th.textContent = header
      headerRow.appendChild(th)
    })
    const thead = document.createElement("thead")
    thead.appendChild(headerRow)
    csvPreviewTable.appendChild(thead)

    const tbody = document.createElement("tbody")
    // Create data rows (limit to 5 for preview)
    const previewData = csvData.data.slice(0, 5)
    previewData.forEach((row) => {
      const tr = document.createElement("tr")
      csvData.headers.forEach((header) => {
        const td = document.createElement("td")
        td.textContent = row[header] || ""
        tr.appendChild(td)
      })
      tbody.appendChild(tr)
    })
    csvPreviewTable.appendChild(tbody)

    // Show preview container
    csvPreviewContainer.classList.remove("hidden")
  }

  // Add this to the populateColumnMappings function to simplify the mapping interface
  function populateColumnMappings() {
    // Clear existing options (except the first one)
    ;[fullNameColumn, locationColumn].forEach((select) => {
      while (select.options.length > 1) {
        select.remove(1)
      }
    })

    // Add options for each header
    csvData.headers.forEach((header) => {
      // Add options to the visible selects
      ;[fullNameColumn, locationColumn].forEach((select) => {
        const option = document.createElement("option")
        option.value = header
        option.textContent = header
        select.appendChild(option)

        // Auto-select columns based on common naming patterns
        if (
          select === fullNameColumn &&
          (header.toLowerCase().includes("full name") ||
            header.toLowerCase() === "name" ||
            header.toLowerCase().includes("name (formatted)"))
        ) {
          select.value = header
        } else if (
          select === locationColumn &&
          (header.toLowerCase().includes("location") ||
            header.toLowerCase().includes("address") ||
            header.toLowerCase().includes("contact address (city, state)"))
        ) {
          select.value = header
        }
      })
    })

    // Auto-populate the hidden fields based on the visible selections
    fullNameColumn.addEventListener("change", autoPopulateNameFields)
    locationColumn.addEventListener("change", autoPopulateLocationFields)

    // Initial auto-population
    autoPopulateNameFields()
    autoPopulateLocationFields()
  }

  // Function to auto-populate name fields based on the full name selection
  function autoPopulateNameFields() {
    const selectedFullName = fullNameColumn.value

    // Clear first and last name selections
    firstNameColumn.value = ""
    lastNameColumn.value = ""

    // Auto-detect first and last name columns based on the full name selection
    if (selectedFullName) {
      csvData.headers.forEach((header) => {
        if (
          header.toLowerCase().includes("first name") ||
          header.toLowerCase() === "firstname" ||
          header.toLowerCase().includes("owner 1 first name")
        ) {
          firstNameColumn.value = header
        } else if (
          header.toLowerCase().includes("last name") ||
          header.toLowerCase() === "lastname" ||
          header.toLowerCase().includes("owner 1 last name")
        ) {
          lastNameColumn.value = header
        }
      })
    }
  }

  // Function to auto-populate location fields based on the location selection
  function autoPopulateLocationFields() {
    const selectedLocation = locationColumn.value

    // Clear city, state, and zip selections
    cityColumn.value = ""
    stateColumn.value = ""
    zipColumn.value = ""

    // Auto-detect city, state, and zip columns based on the location selection
    if (selectedLocation) {
      // If the location column contains "city, state", try to find separate columns
      if (selectedLocation.toLowerCase().includes("city") && selectedLocation.toLowerCase().includes("state")) {
        // This is likely a combined field, so look for separate fields for city and state
        csvData.headers.forEach((header) => {
          if (header.toLowerCase().includes("city") && header !== selectedLocation) {
            cityColumn.value = header
          } else if (header.toLowerCase().includes("state") && header !== selectedLocation) {
            stateColumn.value = header
          } else if (header.toLowerCase().includes("zip")) {
            zipColumn.value = header
          }
        })
      } else {
        // Try to find city, state, and zip columns
        csvData.headers.forEach((header) => {
          if (header.toLowerCase().includes("city")) {
            cityColumn.value = header
          } else if (header.toLowerCase().includes("state")) {
            stateColumn.value = header
          } else if (header.toLowerCase().includes("zip")) {
            zipColumn.value = header
          }
        })
      }
    }
  }

  // Update goToNextStep function to include preview step
  function goToNextStep() {
    if (currentStep === 1) {
      // Move to mapping step
      mappingStep.style.display = "block"
      backButton.style.display = "inline-flex"
      nextButton.textContent = "Next"
      nextButton.innerHTML =
        'Next <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon" style="margin-right: 0; margin-left: 6px;"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>'
      currentStep = 2
    } else if (currentStep === 2) {
      // Validate mappings
      if (!validateMappings()) {
        showStatus(
          "Please provide either Full Name or both First Name and Last Name, and either Location or both City and State",
          "error",
        )
        return
      }

      // Generate preview data
      generateMappingPreview()

      // Move to preview step
      previewStep.style.display = "block"
      nextButton.textContent = "Next"
      nextButton.innerHTML =
        'Next <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon" style="margin-right: 0; margin-left: 6px;"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>'
      currentStep = 3
    } else if (currentStep === 3) {
      // Move to proxy step
      const proxyStep = document.getElementById("proxyStep")
      proxyStep.style.display = "block"
      nextButton.textContent = "Next"
      nextButton.innerHTML =
        'Next <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon" style="margin-right: 0; margin-left: 6px;"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>'
      currentStep = 4
    } else if (currentStep === 4) {
      // Process the data
      processCSVData()

      // Move to process step
      processStep.style.display = "block"
      nextButton.style.display = "none"
      startButton.style.display = "inline-flex"
      currentStep = 5

      // Add CAPTCHA resume button if needed
      addCaptchaResumeButton()

      // Save proxy settings to storage
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.set({
          proxyChangeRows: proxyChangeRows,
        })

        // Store only the first 20 proxies to avoid quota issues
        if (proxyData && proxyData.length > 0) {
          chrome.storage.local.set({
            proxyData: proxyData.slice(0, 20),
          })
        }
      }
    }
  }

  // Update goToPreviousStep function to handle preview step
  function goToPreviousStep() {
    if (currentStep === 2) {
      // Move back to upload step
      mappingStep.style.display = "none"
      backButton.style.display = "none"
      currentStep = 1
    } else if (currentStep === 3) {
      // Move back to mapping step
      previewStep.style.display = "none"
      currentStep = 2
    } else if (currentStep === 4) {
      // Move back to preview step
      const proxyStep = document.getElementById("proxyStep")
      proxyStep.style.display = "none"
      currentStep = 3
    } else if (currentStep === 5) {
      // Move back to proxy step
      processStep.style.display = "none"
      const proxyStep = document.getElementById("proxyStep")
      proxyStep.style.display = "block"
      nextButton.style.display = "inline-flex"
      startButton.style.display = "none"
      exportButton.style.display = "none"
      progressContainer.style.display = "none"
      statusMessage.style.display = "none"
      currentStep = 4
    }
  }

  function validateMappings() {
    // Check if we have either full name or both first and last name
    const hasFullName = fullNameColumn.value !== ""
    const hasFirstAndLastName = firstNameColumn.value !== "" && lastNameColumn.value !== ""

    // Check if we have either location or both city and state
    const hasLocation = locationColumn.value !== ""
    const hasCityAndState = cityColumn.value !== "" && stateColumn.value !== ""

    return (hasFullName || hasFirstAndLastName) && (hasLocation || hasCityAndState)
  }

  // Function to generate mapping preview
  function generateMappingPreview() {
    // Clear existing preview
    const tbody = mappingPreviewTable.querySelector("tbody")
    tbody.innerHTML = ""

    // Get the column mappings
    const mappings = {
      fullNameColumn: fullNameColumn.value,
      firstNameColumn: firstNameColumn.value,
      lastNameColumn: lastNameColumn.value,
      locationColumn: locationColumn.value,
      cityColumn: cityColumn.value,
      stateColumn: stateColumn.value,
      zipColumn: zipColumn.value,
      locationFormat: locationFormat.value,
    }

    // Process a few rows for preview
    const previewData = window.csvProcessor.processCSVData(csvData.data.slice(0, 5), mappings)

    // Add rows to the preview table
    previewData.forEach((row, index) => {
      const tr = document.createElement("tr")

      // Row number
      const tdRow = document.createElement("td")
      tdRow.textContent = index + 1
      tr.appendChild(tdRow)

      // Full name
      const tdName = document.createElement("td")
      tdName.textContent = row._tpsFullName || "N/A"
      tr.appendChild(tdName)

      // Location
      const tdLocation = document.createElement("td")
      let locationText = ""
      if (row._tpsCity && row._tpsState) {
        locationText = `${row._tpsCity}, ${row._tpsState}`
        if (row._tpsZip) {
          locationText += ` ${row._tpsZip}`
        }
      } else if (row._tpsZip) {
        locationText = row._tpsZip
      } else {
        locationText = "N/A"
      }
      tdLocation.textContent = locationText
      tr.appendChild(tdLocation)

      // URL
      const tdUrl = document.createElement("td")
      tdUrl.textContent = row._tpsSearchUrl || "N/A"
      tdUrl.style.fontSize = "10px"
      tdUrl.style.wordBreak = "break-all"
      tr.appendChild(tdUrl)

      tbody.appendChild(tr)
    })

    // Show preview status
    if (previewData.length > 0) {
      previewStatus.textContent = `Preview of ${previewData.length} out of ${csvData.data.length} total records`
      previewStatus.className = "status success"
      previewStatus.style.display = "block"
    } else {
      previewStatus.textContent = "No data to preview"
      previewStatus.className = "status error"
      previewStatus.style.display = "block"
    }
  }

  // Update processCSVData function to include new options
  function processCSVData() {
    // Get the column mappings
    const mappings = {
      fullNameColumn: fullNameColumn.value,
      firstNameColumn: firstNameColumn.value,
      lastNameColumn: lastNameColumn.value,
      locationColumn: locationColumn.value,
      cityColumn: cityColumn.value,
      stateColumn: stateColumn.value,
      zipColumn: zipColumn.value,
      locationFormat: locationFormat.value,
    }

    // Process the data
    processedData = window.csvProcessor.processCSVData(csvData.data, mappings)

    // Reset processing state
    currentProcessingIndex = 0
    processingActive = false

    // Store the entire processed data object
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({
        originalCsvHeaders: csvData.headers,
        csvProcessingData: {
          data: processedData,
          totalRecords: processedData.length,
        },
      })
    }

    // Update the progress text to show the total number of records
    progressText.textContent = `Processing 0 of ${processedData.length} records`
  }

  // Add a Resume button to the CSV uploader UI
  function startProcessing() {
    if (processingActive) {
      // Stop processing
      processingActive = false
      startButton.innerHTML =
        'Resume Processing <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon" style="margin-right: 0; margin-left: 6px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>'
      showStatus('Processing paused. Click "Resume Processing" to continue.', "success")

      // Update storage
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.set({ processingActive: false })
      }
    } else {
      // Check if processing was paused for CAPTCHA first
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.get(["processingPausedForCaptcha"], (result) => {
          if (result.processingPausedForCaptcha === true) {
            // Reset CAPTCHA pause state and mark as resuming
            chrome.storage.local.set(
              {
                processingPausedForCaptcha: false,
                resumingAfterCaptcha: true,
              },
              () => {
                resumeProcessingNow()
              },
            )
          } else {
            resumeProcessingNow()
          }
        })
      } else {
        resumeProcessingNow()
      }
    }

    function resumeProcessingNow() {
      // Start/resume processing
      processingActive = true
      startButton.innerHTML =
        'Pause Processing <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon" style="margin-right: 0; margin-left: 6px;"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>'
      progressContainer.style.display = "block"

      // If we've processed all records, show export button
      if (currentProcessingIndex >= processedData.length) {
        showStatus("All records have been processed. You can export the results now.", "success")
        exportButton.style.display = "inline-flex"
        startButton.style.display = "none"
        return
      }

      // Set processing active flag in storage - only store the current index
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.set(
          {
            processingActive: true,
            currentProcessingIndex: currentProcessingIndex,
          },
          () => {
            console.log("Processing state saved, starting to process records")
            // Process the next record
            processNextRecord()
          },
        )
      } else {
        // Process the next record
        processNextRecord()
      }
    }
  }

  // Add a special handler for checking CAPTCHA status directly in processNextRecord
  // Update processNextRecord to handle proxy rotation
  function processNextRecord() {
    if (!processingActive) return

    // Check if we've processed all records
    if (currentProcessingIndex >= processedData.length) {
      processingActive = false
      startButton.style.display = "none"
      exportButton.style.display = "inline-flex"
      showStatus("All records have been processed. You can export the results now.", "success")

      // Clear proxy settings when done
      if (proxyData && proxyData.length > 0 && window.proxyHandler) {
        window.proxyHandler.clearProxy().then(() => {
          if (typeof chrome !== "undefined" && chrome.storage) {
            chrome.storage.local.set({ currentProxy: null })
          }
        })
      }

      return
    }

    // First check if processing is paused due to CAPTCHA
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(
        ["processingPausedForCaptcha", "resumingAfterCaptcha", "captchaSolvedTime", "blockedProxies", "proxyData"],
        async (result) => {
          // If paused due to CAPTCHA and not explicitly resuming, stop processing
          if (result.processingPausedForCaptcha === true && result.resumingAfterCaptcha !== true) {
            console.log("Processing paused due to CAPTCHA detection")
            showStatus("Processing paused due to Cloudflare CAPTCHA. Please solve the CAPTCHA to continue.", "warning")
            startButton.innerHTML =
              'Resume Processing <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon" style="margin-right: 0; margin-left: 6px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>'
            processingActive = false

            // Don't schedule any more processing
            return
          }

          // Check if CAPTCHA was recently solved (within the last 10 seconds)
          const captchaRecentlySolved = result.captchaSolvedTime && Date.now() - result.captchaSolvedTime < 10000

          // If CAPTCHA was recently solved, show a notification
          if (captchaRecentlySolved) {
            showStatus("CAPTCHA solved! Resuming processing...", "success")
          }

          // If we were resuming after CAPTCHA, clear that flag
          if (result.resumingAfterCaptcha === true) {
            chrome.storage.local.set({ resumingAfterCaptcha: false })
          }

          // Update progress
          const progress = (currentProcessingIndex / processedData.length) * 100
          progressFill.style.width = `${progress}%`
          progressText.textContent = `Processing ${currentProcessingIndex + 1} of ${processedData.length} records`

          // Check if we need to rotate proxy
          if (proxyData && proxyData.length > 0 && currentProcessingIndex % proxyChangeRows === 0) {
            // Get the next proxy
            const nextProxyIndex = Math.floor(currentProcessingIndex / proxyChangeRows) % proxyData.length
            const nextProxy = proxyData[nextProxyIndex]

            // Apply the proxy
            if (window.proxyHandler) {
              try {
                await window.proxyHandler.applyProxy(nextProxy)
                showStatus(`Applied proxy: ${nextProxy.host}:${nextProxy.port}`, "success")
              } catch (error) {
                console.error("Error applying proxy:", error)
                showStatus(`Error applying proxy: ${error.message}`, "error")
              }
            }
          }

          // Resume normal processing
          continueProcessing()
        },
      )
    } else {
      // If chrome storage is not available, just continue processing
      continueProcessing()
    }

    function continueProcessing() {
      // Check if chrome is defined (running as a Chrome extension)
      if (typeof chrome !== "undefined" && chrome && chrome.tabs) {
        // Get the current record
        const record = processedData[currentProcessingIndex]

        console.log(`Processing record ${currentProcessingIndex + 1}: ${record._tpsSearchUrl}`)

        // Get the current tab ID to be used as the 'previous' tab later
        chrome.storage.local.get('currentProcessingTab', (result) => {
          const previousTabId = result.currentProcessingTab;

          // Store the current processing URL and index
          chrome.storage.local.set(
            {
              currentProcessingUrl: record._tpsSearchUrl,
              currentProcessingIndex: currentProcessingIndex,
              processingActive: true,
            },
            () => {
              // Open the URL in a new tab
              try {
                chrome.tabs.create({ url: record._tpsSearchUrl, active: true }, (newTab) => {
                  if (chrome.runtime.lastError) {
                    console.error("Error creating tab:", chrome.runtime.lastError)
                    showStatus(`Error opening URL: ${chrome.runtime.lastError.message}`, "error")
                    return
                  }

                  console.log(`Created tab with ID: ${newTab.id} for URL: ${record._tpsSearchUrl}`)

                  // Store the new tab ID and the previous tab ID
                  chrome.storage.local.set({
                    currentProcessingTab: newTab.id,
                    previousProcessingTab: previousTabId,
                  });

                  // Increment the index
                  currentProcessingIndex++

                  // Schedule the next record to be processed after a delay
                  setTimeout(processNextRecord, delaySeconds * 1000)
                })
              } catch (error) {
                console.error("Exception creating tab:", error)
                showStatus(`Error: ${error.message}`, "error")
              }
            },
          )
        });
      } else {
        // If chrome is not defined, just log the URL and increment the index
        const record = processedData[currentProcessingIndex]
        console.log(`Processing record ${currentProcessingIndex + 1}: ${record._tpsSearchUrl}`)
        currentProcessingIndex++

        // Schedule the next record to be processed after a delay
        setTimeout(processNextRecord, delaySeconds * 1000)
      }
    }
  }

  // Add a function to export the results to a CSV file
  function exportResults() {
    if (typeof chrome !== "undefined" && chrome.storage) {
      // Get the latest, enriched data from storage
      chrome.storage.local.get(["originalCsvHeaders", "csvProcessingData"], (result) => {
        if (!result.csvProcessingData || !result.csvProcessingData.data) {
          showStatus("No processed data found to export.", "error")
          return
        }

        const originalCsvHeaders = result.originalCsvHeaders || (csvData ? csvData.headers : [])
        const finalData = result.csvProcessingData.data

        // Convert the final data to a CSV string
        const csvString = window.csvProcessor.convertToCSV(finalData, originalCsvHeaders)

        // Create a download link
        const downloadLink = document.createElement("a")
        downloadLink.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csvString)
        downloadLink.download = "tps_results_enriched.csv"

        // Add the link to the document and click it
        document.body.appendChild(downloadLink)
        downloadLink.click()

        // Remove the link from the document
        document.body.removeChild(downloadLink)
      })
    } else {
      // Fallback for non-chrome environment
      if (!processedData) {
        showStatus("No processed data to export.", "error")
        return
      }
      const csvString = window.csvProcessor.convertToCSV(processedData, csvData.headers)
      const downloadLink = document.createElement("a")
      downloadLink.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csvString)
      downloadLink.download = "tps_results_enriched.csv"
      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)
    }
  }

  // Add a function to show status messages
  function showStatus(message, type = "info") {
    statusMessage.textContent = message
    statusMessage.className = `status ${type}`
    statusMessage.style.display = "block"
  }

  // Add a function to add a CAPTCHA resume button
  function addCaptchaResumeButton() {
    // Check if the button already exists
    if (document.getElementById("captchaResumeButton")) {
      return
    }

    // Create the button
    const captchaResumeButton = document.createElement("button")
    captchaResumeButton.id = "captchaResumeButton"
    captchaResumeButton.textContent = "Resume After CAPTCHA"
    captchaResumeButton.className = "button primary"

    // Add the button to the process step
    processStep.appendChild(captchaResumeButton)

    // Add an event listener to the button
    captchaResumeButton.addEventListener("click", () => {
      // Resume processing
      startProcessing()

      // Remove the button
      captchaResumeButton.remove()
    })
  }
})