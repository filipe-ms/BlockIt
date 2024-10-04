/*                  *
 ***** POPUP.JS *****
 *                  */

 
function getHostname() {
    // Gets the hostname and tab ID from the active tab.
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs && tabs.length > 0) {
                var currentUrl = new URL(tabs[0].url);
                var hostname = currentUrl.hostname;
                var tabId = tabs[0].id; // Get the tab ID

                resolve({ hostname: hostname, tabId: tabId });
            } else {
                reject(new Error("No active tab found."));
            }
        });
    });
}

function blockThisHostname() {
    // Blocks hostname of the active tab.
    getHostname()
        .then(({ hostname, tabId }) => {
            chrome.runtime.sendMessage({ action: "blockHostname", hostname: hostname, tabId: tabId });
        })
        .catch((error) => {
            console.error("Error getting hostname:", error);
        });
}

function updateClosedTabsCounterDisplay() {
    chrome.runtime.sendMessage(
        { action: "getClosedTabsCounter" },
        function (response) {
            if (response && response.success) {
                document.getElementById("closedTabsCounter").textContent = response.value;
            } else {
                console.error("Failed to retrieve closedTabsCounter:", response ? response.error : "No response received");
            }
        }
    );
}

function updateBlockedHostnamesCounterDisplay() {
    chrome.runtime.sendMessage(
        { action: "getBlockedHostnamesCounter" },
        function (response) {
            if (response && response.success) {
                document.getElementById("blockedHostnamesCounter").textContent = response.value;
            } else {
                console.error("Failed to retrieve blocked hostnames counter:", response.error);
            }
        }
    );
}

/* DOMContentLoaded */

document.addEventListener("DOMContentLoaded", function () {
    updateClosedTabsCounterDisplay();
    updateBlockedHostnamesCounterDisplay();
});

document.addEventListener("DOMContentLoaded", function () {
    document
        .getElementById("blockHostname")
        .addEventListener("click", function () {
            blockThisHostname();
        });
});





