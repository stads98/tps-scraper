# AI Development Rules for TruePeopleSearch Scraper

This document outlines the core technologies and best practices to follow when developing or modifying the TruePeopleSearch Scraper application.

## Tech Stack Overview

The application is built using a modern web development stack, specifically tailored for a Chrome extension environment:

*   **React & Next.js:** The primary framework for building the user interface, leveraging Next.js for its development features, though the main extension UI is served via static HTML files.
*   **TypeScript:** The main programming language, ensuring type safety and improving code maintainability.
*   **Tailwind CSS:** A utility-first CSS framework used for all styling, enabling rapid and consistent UI development.
*   **shadcn/ui & Radix UI:** A collection of pre-built, accessible, and customizable UI components. shadcn/ui components are built on top of Radix UI primitives.
*   **Lucide React:** The chosen library for incorporating vector icons throughout the application.
*   **React Hook Form & Zod:** Used together for robust and efficient form management and data validation.
*   **Chrome Extension APIs:** Direct interaction with browser APIs (`chrome.storage`, `chrome.tabs`, `chrome.runtime`, `chrome.proxy`, `chrome.webRequest`) is fundamental for the extension's core functionalities like data storage, tab management, and network proxy control.
*   **Custom JavaScript Utilities:** Dedicated JavaScript files (`csv-processor.js`, `proxy-handler.js`) handle specific business logic related to CSV data manipulation and proxy management.
*   **Sonner:** A modern toast notification library used for displaying user feedback.

## Library Usage Rules

To maintain consistency, performance, and readability, adhere to the following guidelines for library usage:

*   **UI Components:** Always use components from the `shadcn/ui` library. If a specific component is not available or requires significant customization, create a new, small, and focused React component in `src/components/` and style it exclusively with Tailwind CSS. **Do not modify existing `shadcn/ui` component files directly.**
*   **Styling:** All visual styling must be implemented using Tailwind CSS classes. Avoid inline styles or separate CSS files unless absolutely necessary for global styles (e.g., `app/globals.css`).
*   **Icons:** For all icon needs, use components provided by the `lucide-react` library.
*   **Forms & Validation:** Implement all forms using `react-hook-form` for state management and `zod` for defining and validating form schemas.
*   **Notifications:** Use the `sonner` library for all toast notifications. Integrate it via the existing `useToast` hook and `Toast` components found in `components/ui/`.
*   **Data Storage (Extension):** For persistent data storage within the Chrome extension, utilize `chrome.storage.local`.
*   **Inter-script Communication (Extension):** Communication between different parts of the Chrome extension (e.g., popup, content script, background script) should be handled using `chrome.runtime.sendMessage`.
*   **Network & Proxy Management (Extension):** All proxy-related operations, including parsing proxy lists, applying, clearing, and testing proxies, must use the functions provided by `proxy-handler.js`.
*   **CSV Operations:** For parsing, processing, and converting CSV data, use the utility functions exposed by `csv-processor.js`.
*   **New Components/Hooks:** Any new React components should be created in `src/components/` and new custom React hooks in `src/hooks/`. Each component or hook should reside in its own dedicated file.
*   **Routing:** The current application is a Chrome extension, and its primary UI is served via static HTML files (`popup.html`, `csv-uploader.html`). React Router is not used for this purpose. If the project were to expand to include traditional web-based pages, they should be placed in `src/pages/` following Next.js conventions.