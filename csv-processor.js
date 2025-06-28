// CSV processing functionality for TruePeopleSearch Scraper

// Ensure the window.csvProcessor object is properly initialized
if (typeof window.csvProcessor === "undefined") {
  // Function to parse location string into components
  function parseLocationString(locationString) {
    if (!locationString) return { city: "", state: "", zip: "" }

    // Try to match patterns like "CITY, STATE ZIP" or "CITY, STATE"
    const locationRegex = /([^,]+),\s*([A-Z]{2})(?:\s+(\d{5}))?/i
    const match = locationString.match(locationRegex)

    if (match) {
      return {
        city: match[1].trim(),
        state: match[2].trim(),
        zip: match[3] ? match[3].trim() : "",
      }
    }

    // If no match, try to see if it's just a ZIP code
    const zipRegex = /^\s*(\d{5})\s*$/
    const zipMatch = locationString.match(zipRegex)

    if (zipMatch) {
      return {
        city: "",
        state: "",
        zip: zipMatch[1],
      }
    }

    // If all else fails, return the original string as city
    return {
      city: locationString.trim(),
      state: "",
      zip: "",
    }
  }

  // Function to create TruePeopleSearch URL with more flexible location options
  function createSearchUrl(fullName, location, locationFormat) {
    // Ensure the inputs are strings and handle empty values
    fullName = fullName && typeof fullName === "string" ? fullName.trim() : ""

    // Parse location components
    let locationComponents = {}
    if (typeof location === "string") {
      locationComponents = parseLocationString(location)
    } else if (typeof location === "object") {
      locationComponents = location
    }

    // URL encode the name
    const encodedName = encodeURIComponent(fullName)

    // Format location based on preference
    let formattedLocation = ""

    switch (locationFormat) {
      case "city_state":
        if (locationComponents.city && locationComponents.state) {
          formattedLocation = `${locationComponents.city}, ${locationComponents.state}`
        }
        break
      case "city_state_zip":
        if (locationComponents.city && locationComponents.state && locationComponents.zip) {
          formattedLocation = `${locationComponents.city}, ${locationComponents.state} ${locationComponents.zip}`
        } else if (locationComponents.city && locationComponents.state) {
          formattedLocation = `${locationComponents.city}, ${locationComponents.state}`
        }
        break
      case "zip_only":
        if (locationComponents.zip) {
          formattedLocation = locationComponents.zip
        }
        break
      default:
        // Default to using whatever we have
        if (locationComponents.city && locationComponents.state) {
          formattedLocation = `${locationComponents.city}, ${locationComponents.state}`
          if (locationComponents.zip) {
            formattedLocation += ` ${locationComponents.zip}`
          }
        } else if (locationComponents.zip) {
          formattedLocation = locationComponents.zip
        } else if (typeof location === "string") {
          formattedLocation = location.trim()
        }
    }

    // URL encode the location
    const encodedLocation = encodeURIComponent(formattedLocation)

    // Construct the URL
    return `https://www.truepeoplesearch.com/results?name=${encodedName}&citystatezip=${encodedLocation}`
  }

  // Function to extract first and last name from full name
  function extractNames(fullName) {
    if (!fullName) return { firstName: "", lastName: "" }

    const parts = fullName.trim().split(" ")
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: "" }
    }

    const firstName = parts[0]
    const lastName = parts.slice(1).join(" ")

    return { firstName, lastName }
  }

  // Function to combine city and state into a location string
  function formatLocation(city, state) {
    const cityStr = city ? city.trim() : ""
    const stateStr = state ? state.trim() : ""

    if (cityStr && stateStr) {
      return `${cityStr}, ${stateStr}`
    } else if (cityStr) {
      return cityStr
    } else if (stateStr) {
      return stateStr
    }

    return ""
  }

  window.csvProcessor = {
    parseCSV: (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader()

        reader.onload = (event) => {
          try {
            const csvData = event.target.result
            const lines = csvData.split("\n")
            const headers = lines[0].split(",").map((header) => header.trim().replace(/^"|"$/g, ""))

            const results = []

            for (let i = 1; i < lines.length; i++) {
              // Skip empty lines
              if (lines[i].trim() === "") continue

              // Handle quoted values with commas inside them
              const row = []
              let inQuote = false
              let currentValue = ""

              for (let j = 0; j < lines[i].length; j++) {
                const char = lines[i][j]

                if (char === '"' && (j === 0 || lines[i][j - 1] !== "\\")) {
                  inQuote = !inQuote
                } else if (char === "," && !inQuote) {
                  row.push(currentValue.replace(/^"|"$/g, "").trim())
                  currentValue = ""
                } else {
                  currentValue += char
                }
              }

              // Add the last value
              row.push(currentValue.replace(/^"|"$/g, "").trim())

              // Create an object with headers as keys
              const rowObject = {}
              headers.forEach((header, index) => {
                rowObject[header] = index < row.length ? row[index] : ""
              })

              results.push(rowObject)
            }

            resolve({
              headers,
              data: results,
            })
          } catch (error) {
            reject(error)
          }
        }

        reader.onerror = () => {
          reject(new Error("Error reading the CSV file"))
        }

        reader.readAsText(file)
      }),
    processCSVData: (data, mappings) =>
      data.map((row) => {
        let fullName = ""
        let location = ""

        // Handle full name mapping
        if (mappings.fullNameColumn && row[mappings.fullNameColumn]) {
          fullName = row[mappings.fullNameColumn]
        } else if (mappings.firstNameColumn && mappings.lastNameColumn) {
          const firstName = row[mappings.firstNameColumn] || ""
          const lastName = row[mappings.lastNameColumn] || ""
          fullName = `${firstName} ${lastName}`.trim()
        }

        // Handle location mapping based on format preference
        if (mappings.locationColumn && row[mappings.locationColumn]) {
          location = row[mappings.locationColumn]
        } else if (mappings.cityColumn && mappings.stateColumn) {
          const city = row[mappings.cityColumn] || ""
          const state = row[mappings.stateColumn] || ""
          const zip = mappings.zipColumn ? row[mappings.zipColumn] || "" : ""

          location = {
            city: city,
            state: state,
            zip: zip,
          }
        }

        // Generate the search URL
        const searchUrl = createSearchUrl(fullName, location, mappings.locationFormat)

        // Return the row with the added URL and parsed location components
        const locationComponents = typeof location === "string" ? parseLocationString(location) : location

        // Create a new object that preserves all original data
        const result = { ...row }

        // Add TPS-specific fields
        result._tpsSearchUrl = searchUrl
        result._tpsProcessed = false
        result._tpsFullName = fullName
        result._tpsCity = locationComponents.city || ""
        result._tpsState = locationComponents.state || ""
        result._tpsZip = locationComponents.zip || ""

        return result
      }),
    convertToCSV: (data, headers) => {
      // Add our custom headers if they don't exist
      const allHeaders = [...headers]

      // Add TPS data headers if they don't exist
      const tpsHeaders = [
        "TPS_Name",
        "TPS_Location",
        "TPS_City",
        "TPS_State",
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

      tpsHeaders.forEach((header) => {
        if (!allHeaders.includes(header)) {
          allHeaders.push(header)
        }
      })

      // Add processing headers if they don't exist
      if (!allHeaders.includes("_tpsSearchUrl")) {
        allHeaders.push("_tpsSearchUrl")
      }
      if (!allHeaders.includes("_tpsProcessed")) {
        allHeaders.push("_tpsProcessed")
      }

      // Create CSV header row
      let csvContent = allHeaders.map((header) => `"${header}"`).join(",") + "\n"

      // Add data rows
      data.forEach((row) => {
        const rowValues = allHeaders.map((header) => {
          const value = row[header] !== undefined ? row[header] : ""
          // Escape quotes and wrap in quotes if needed
          return `"${String(value).replace(/"/g, '""')}"`
        })
        csvContent += rowValues.join(",") + "\n"
      })

      return csvContent
    },
    createSearchUrl,
    extractNames,
    formatLocation,
  }
} else {
  // CSV processing functionality for TruePeopleSearch Scraper

  // Function to parse CSV file
  function parseCSV(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (event) => {
        try {
          const csvData = event.target.result
          const lines = csvData.split("\n")
          const headers = lines[0].split(",").map((header) => header.trim().replace(/^"|"$/g, ""))

          const results = []

          for (let i = 1; i < lines.length; i++) {
            // Skip empty lines
            if (lines[i].trim() === "") continue

            // Handle quoted values with commas inside them
            const row = []
            let inQuote = false
            let currentValue = ""

            for (let j = 0; j < lines[i].length; j++) {
              const char = lines[i][j]

              if (char === '"' && (j === 0 || lines[i][j - 1] !== "\\")) {
                inQuote = !inQuote
              } else if (char === "," && !inQuote) {
                row.push(currentValue.replace(/^"|"$/g, "").trim())
                currentValue = ""
              } else {
                currentValue += char
              }
            }

            // Add the last value
            row.push(currentValue.replace(/^"|"$/g, "").trim())

            // Create an object with headers as keys
            const rowObject = {}
            headers.forEach((header, index) => {
              rowObject[header] = index < row.length ? row[index] : ""
            })

            results.push(rowObject)
          }

          resolve({
            headers,
            data: results,
          })
        } catch (error) {
          reject(error)
        }
      }

      reader.onerror = () => {
        reject(new Error("Error reading the CSV file"))
      }

      reader.readAsText(file)
    })
  }

  // Function to parse location string into components
  function parseLocationString(locationString) {
    if (!locationString) return { city: "", state: "", zip: "" }

    // Try to match patterns like "CITY, STATE ZIP" or "CITY, STATE"
    const locationRegex = /([^,]+),\s*([A-Z]{2})(?:\s+(\d{5}))?/i
    const match = locationString.match(locationRegex)

    if (match) {
      return {
        city: match[1].trim(),
        state: match[2].trim(),
        zip: match[3] ? match[3].trim() : "",
      }
    }

    // If no match, try to see if it's just a ZIP code
    const zipRegex = /^\s*(\d{5})\s*$/
    const zipMatch = locationString.match(zipRegex)

    if (zipMatch) {
      return {
        city: "",
        state: "",
        zip: zipMatch[1],
      }
    }

    // If all else fails, return the original string as city
    return {
      city: locationString.trim(),
      state: "",
      zip: "",
    }
  }

  // Function to create TruePeopleSearch URL with more flexible location options
  function createSearchUrl(fullName, location, locationFormat) {
    // Ensure the inputs are strings and handle empty values
    fullName = fullName && typeof fullName === "string" ? fullName.trim() : ""

    // Parse location components
    let locationComponents = {}
    if (typeof location === "string") {
      locationComponents = parseLocationString(location)
    } else if (typeof location === "object") {
      locationComponents = location
    }

    // URL encode the name
    const encodedName = encodeURIComponent(fullName)

    // Format location based on preference
    let formattedLocation = ""

    switch (locationFormat) {
      case "city_state":
        if (locationComponents.city && locationComponents.state) {
          formattedLocation = `${locationComponents.city}, ${locationComponents.state}`
        }
        break
      case "city_state_zip":
        if (locationComponents.city && locationComponents.state && locationComponents.zip) {
          formattedLocation = `${locationComponents.city}, ${locationComponents.state} ${locationComponents.zip}`
        } else if (locationComponents.city && locationComponents.state) {
          formattedLocation = `${locationComponents.city}, ${locationComponents.state}`
        }
        break
      case "zip_only":
        if (locationComponents.zip) {
          formattedLocation = locationComponents.zip
        }
        break
      default:
        // Default to using whatever we have
        if (locationComponents.city && locationComponents.state) {
          formattedLocation = `${locationComponents.city}, ${locationComponents.state}`
          if (locationComponents.zip) {
            formattedLocation += ` ${locationComponents.zip}`
          }
        } else if (locationComponents.zip) {
          formattedLocation = locationComponents.zip
        } else if (typeof location === "string") {
          formattedLocation = location.trim()
        }
    }

    // URL encode the location
    const encodedLocation = encodeURIComponent(formattedLocation)

    // Construct the URL
    return `https://www.truepeoplesearch.com/results?name=${encodedName}&citystatezip=${encodedLocation}`
  }

  // Function to extract first and last name from full name
  function extractNames(fullName) {
    if (!fullName) return { firstName: "", lastName: "" }

    const parts = fullName.trim().split(" ")
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: "" }
    }

    const firstName = parts[0]
    const lastName = parts.slice(1).join(" ")

    return { firstName, lastName }
  }

  // Function to combine city and state into a location string
  function formatLocation(city, state) {
    const cityStr = city ? city.trim() : ""
    const stateStr = state ? state.trim() : ""

    if (cityStr && stateStr) {
      return `${cityStr}, ${stateStr}`
    } else if (cityStr) {
      return cityStr
    } else if (stateStr) {
      return stateStr
    }

    return ""
  }

  // Modify the processCSVData function to better handle the simplified mapping
  function processCSVData(data, mappings) {
    return data.map((row) => {
      let fullName = ""
      let location = ""

      // Handle full name mapping
      if (mappings.fullNameColumn && row[mappings.fullNameColumn]) {
        fullName = row[mappings.fullNameColumn]
      } else if (mappings.firstNameColumn && mappings.lastNameColumn) {
        const firstName = row[mappings.firstNameColumn] || ""
        const lastName = row[mappings.lastNameColumn] || ""
        fullName = `${firstName} ${lastName}`.trim()
      }

      // Handle location mapping based on format preference
      if (mappings.locationColumn && row[mappings.locationColumn]) {
        location = row[mappings.locationColumn]
      } else if (mappings.cityColumn && mappings.stateColumn) {
        const city = row[mappings.cityColumn] || ""
        const state = row[mappings.stateColumn] || ""
        const zip = mappings.zipColumn ? row[mappings.zipColumn] || "" : ""

        location = {
          city: city,
          state: state,
          zip: zip,
        }
      }

      // Generate the search URL
      const searchUrl = createSearchUrl(fullName, location, mappings.locationFormat)

      // Return the row with the added URL and parsed location components
      const locationComponents = typeof location === "string" ? parseLocationString(location) : location

      // Create a new object that preserves all original data
      const result = { ...row }

      // Add TPS-specific fields
      result._tpsSearchUrl = searchUrl
      result._tpsProcessed = false
      result._tpsFullName = fullName
      result._tpsCity = locationComponents.city || ""
      result._tpsState = locationComponents.state || ""
      result._tpsZip = locationComponents.zip || ""

      return result
    })
  }

  // Function to convert processed data back to CSV
  function convertToCSV(data, headers) {
    // Add our custom headers if they don't exist
    const allHeaders = [...headers]

    // Add TPS data headers if they don't exist
    const tpsHeaders = [
      "TPS_Name",
      "TPS_Location",
      "TPS_City",
      "TPS_State",
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

    tpsHeaders.forEach((header) => {
      if (!allHeaders.includes(header)) {
        allHeaders.push(header)
      }
    })

    // Add processing headers if they don't exist
    if (!allHeaders.includes("_tpsSearchUrl")) {
      allHeaders.push("_tpsSearchUrl")
    }
    if (!allHeaders.includes("_tpsProcessed")) {
      allHeaders.push("_tpsProcessed")
    }

    // Create CSV header row
    let csvContent = allHeaders.map((header) => `"${header}"`).join(",") + "\n"

    // Add data rows
    data.forEach((row) => {
      const rowValues = allHeaders.map((header) => {
        const value = row[header] !== undefined ? row[header] : ""
        // Escape quotes and wrap in quotes if needed
        return `"${String(value).replace(/"/g, '""')}"`
      })
      csvContent += rowValues.join(",") + "\n"
    })

    return csvContent
  }

  // Export functions for use in other files
  window.csvProcessor = {
    parseCSV,
    createSearchUrl,
    extractNames,
    formatLocation,
    processCSVData,
    convertToCSV,
  }
}
