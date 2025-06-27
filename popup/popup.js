/*                  *
 ***** POPUP.JS *****
 *                  */

// Function to get the hostname of the active tab 
function getHostname() {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs && tabs.length > 0 && tabs[0].url) {
                try {
                    const currentUrl = new URL(tabs[0].url);
                    const hostname = currentUrl.hostname;
                    const tabId = tabs[0].id;
                    resolve({ hostname: hostname, tabId: tabId });
                } catch (error) {
                    reject(new Error("Invalid URL or error parsing hostname.", { cause: error }));
                }
            } else {
                reject(new Error("No active tab found or URL not accessible."));
            }
        });
    });
}

// Function to block the hostname of the active tab
async function blockThisHostname() {
    try {
        const { hostname, tabId } = await getHostname();

        // Send message to background script and wait for response
        chrome.runtime.sendMessage({ action: "blockHostname", hostname: hostname, tabId: tabId }, function(response) {
            if (chrome.runtime.lastError) {
                console.error("Error sending message to block hostname:", chrome.runtime.lastError.message);
                showMessage("popupMessage", `Error: ${chrome.runtime.lastError.message}`, true);
                return;
            }

            if (response && response.success) {
                showMessage("popupMessage", `"${hostname}" blocked!`, false);
                updateAllCountersDisplay(); // Refresh counters after successful block
            } else {
                const errorMessage = response && response.error ? response.error : "Unknown error";
                console.error("Failed to block hostname:", hostname, errorMessage);
                showMessage("popupMessage", `Failed to block "${hostname}". ${errorMessage}`, true);
            }
        });

    } catch (error) {
        console.error("Error getting hostname for blocking:", error);
        showMessage("popupMessage", `Could not block page: ${error.message}`, true);
    }
}

// Displays a message in the popup for a specified duration.
function showMessage(elementId, message, isError = true) {
    const messageElement = document.getElementById(elementId);
    if (!messageElement) {
        console.error(`Message element with ID '${elementId}' not found in popup.html.`);
        return;
    }
    messageElement.textContent = message;
    messageElement.style.color = isError ? 'red' : 'green';
    setTimeout(() => {
        messageElement.textContent = '';
    }, 3000); // Message disappears after 3 seconds
}

// Function to update the closed tabs counter display
function updateClosedTabsCounterDisplay() {
    chrome.runtime.sendMessage(
        { action: "getClosedTabsCounter" },
        function (response) {
            if (chrome.runtime.lastError) {
                console.error("Error getting closed tabs counter:", chrome.runtime.lastError.message);
                document.getElementById("closedTabsCounter").textContent = "Error";
                return;
            }
            if (response && response.success) {
                document.getElementById("closedTabsCounter").textContent = response.value;
            } else {
                const errorMessage = response ? response.error : "No response received";
                console.error("Failed to retrieve closedTabsCounter:", errorMessage);
                document.getElementById("closedTabsCounter").textContent = "Error";
            }
        }
    );
}

// Function to update the blocked hostnames counter display
function updateBlockedHostnamesCounterDisplay() {
    chrome.runtime.sendMessage(
        { action: "getBlockedHostnamesCounter" },
        function (response) {
            if (chrome.runtime.lastError) {
                console.error("Error getting blocked hostnames counter:", chrome.runtime.lastError.message);
                document.getElementById("blockedHostnamesCounter").textContent = "Error";
                return;
            }
            if (response && response.success) {
                document.getElementById("blockedHostnamesCounter").textContent = response.value;
            } else {
                const errorMessage = response ? response.error : "No response received";
                console.error("Failed to retrieve blocked hostnames counter:", errorMessage);
                document.getElementById("blockedHostnamesCounter").textContent = "Error";
            }
        }
    );
}

// Function to update all counters display
function updateAllCountersDisplay() {
    updateClosedTabsCounterDisplay();
    updateBlockedHostnamesCounterDisplay();
}

/* DOMContentLoaded */

document.addEventListener("DOMContentLoaded", function () {
    updateAllCountersDisplay();

    // Attach event listener to the "Block this page" button.
    document.getElementById("blockHostname").addEventListener("click", function () {
        blockThisHostname();
    });
});





