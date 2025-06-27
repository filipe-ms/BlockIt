/*                    *
 ***** CONTENT.JS *****
 *                    */


/* Tab Checker */

/*
 * This content script runs at 'document_start' to ensure it can check and    *
 * close tabs very quickly, minimizing exposure to blocked content.           *
 * Opening a new tab in Chrome and other browsers unavoidably makes the new   *
 * tab the active one, so there's no need of managing tab IDs and terminating *
 * specific tabs, which would otherwise be slower.                            */

/*
 * Checks if the current tab's hostname is in the block list.                 *
 * If blocked, it sends a message to update counters in the background script *
 * and then immediately closes the current window/tab.                        */

function checkForBlockedHostname() {
    const currentHostname = location.hostname;

    // Send message to background script to check if hostname is blocked.
    chrome.runtime.sendMessage(
        { action: "isHostnameBlocked", hostname: currentHostname },
        function (response) {
            // Check for any errors during message sending or response.
            if (chrome.runtime.lastError) {
                console.error("Content script error checking hostname:", chrome.runtime.lastError.message);
                return; // Exit if there's an error.
            }

            // If the response indicates the hostname is blocked.
            if (response) {
                console.log(`Blocked hostname detected: ${currentHostname}. Closing tab.`);

                // Send message to background script to update relevant counters.
                // This message is fire-and-forget as the tab will close immediately.
                chrome.runtime.sendMessage(
                    { action: "updateCounters", hostname: currentHostname },
                    function() {
                        if (chrome.runtime.lastError) {
                            console.error("Content script error updating counters:", chrome.runtime.lastError.message);
                        }
                    }
                );

                // Close the current window/tab.
                window.close();
            } else {
                console.log(`Hostname ${currentHostname} is not blocked.`);
            }
        }
    );
}

// Execute the check immediately when the content script loads.
checkForBlockedHostname();