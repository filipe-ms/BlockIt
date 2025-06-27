/*                    *
 ***** OPTIONS.JS *****
 *                    */

// Creating the blocked hostnames table */
function buildTableContent(values) {
    return values.map(item => `
        <div class="hostnameRow">
            <div class="hostname">${item.address}</div>
            <div>
                <button class="tableBtn tooltip unblockHostnameButton" data-hostname="${item.address}">
                    <i class="fa-solid fa-xmark"></i>
                    <span class="tooltiptext">Unblock</span>
                </button>
            </div>
        </div>`).join('');
}

function renderBlockedHostnames(values) {
    const blockedHostnamesContainer = document.getElementById("blockedHostnames");
    if (!blockedHostnamesContainer) {
        console.error("Blocked hostnames container not found.");
        return;
    }

    const content = values && values.length > 0
        ? buildTableContent(values)
        : `<div id="emptyList">You don't have any blocked<br>hostname to display yet.</div>`;
    
    blockedHostnamesContainer.innerHTML = content;
}


// Function to send messages to the background script and handles its response
function sendMessage(action, callback) {
    chrome.runtime.sendMessage({ action: action }, function(response) {
        if (chrome.runtime.lastError) {
            console.error(`Error sending message for action '${action}':`, chrome.runtime.lastError.message);
            callback({ success: false, error: chrome.runtime.lastError.message });
        } else if (response) {
            callback(response);
        } else {
            console.error(`No response received for action: ${action}`);
            callback({ success: false, error: "No response received." });
        }
    });
}


// Displays a message to the user for a specified duration.
function showMessage(elementId, message, isError = true) {
    const messageElement = document.getElementById(elementId);
    if (!messageElement) {
        console.error(`Message element with ID '${elementId}' not found.`);
        return;
    }
    messageElement.textContent = message;
    messageElement.style.color = isError ? 'red' : 'green';
    setTimeout(() => {
        messageElement.textContent = '';
    }, 3000); // Message disappears after 3 seconds
}


// Handles the empty state of the blocked hostnames list.
function handleEmptyState(values) {
    const blockedHostnamesContainer = document.getElementById("blockedHostnames");
    if (!blockedHostnamesContainer) {
        console.error("Blocked hostnames container not found.");
        return;
    }
    if (values.length === 0) {
        blockedHostnamesContainer.innerHTML = `<div id="emptyList">You don't have any blocked<br>hostname to display yet.</div>`;
    } else {
        // If there are values, ensure the empty list message is removed if it was present
        const emptyMessage = document.getElementById("emptyList");
        if (emptyMessage) {
            emptyMessage.remove();
        }
    }
}

// Function to debounce clicks. Delay is in milliseconds.
function debounce(func, delay) {
    let debounceTimer;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(context, args), delay);
    }
}

// Unblocks a hostname and updates the UI
function unblockHostname(hostname, itemElement) {
    chrome.runtime.sendMessage({ action: "unblockHostname", hostname }, function(response) {
        if (response && response.success) {
            if (itemElement) {
                itemElement.remove(); // Remove the specific row from the DOM
            }
            updateAllCounters(); // Refresh all counters and the list
            showMessage("hostnameMessage", `"${hostname}" unblocked successfully!`, false);
        } else {
            console.error("Failed to unblock hostname:", hostname, response ? response.error : "Unknown error");
            showMessage("hostnameMessage", `Failed to unblock "${hostname}". ${response && response.error ? response.error : ''}`, true);
        }
    });
}

// Fetches and updates all counters and the blocked hostnames list.
function updateAllCounters() {
    // Re-fetch and update blocked hostnames list
    sendMessage("getBlockedHostnames", function (response) {
        if (response.success) {
            handleEmptyState(response.data);
            renderBlockedHostnames(response.data);
        } else {
            console.error("Error fetching blocked hostnames for display:", response.error);
            document.getElementById("blockedHostnames").innerHTML = `<div id="emptyList" style="color:red;">Error loading blocked hostnames.</div>`;
        }
    });

    // Re-fetch and update blocked hostnames counter
    sendMessage("getBlockedHostnamesCounter", function (response) {
        if (response.success) {
            document.getElementById("blockedHostnamesCounter").innerText = response.value === 0 ? "None." : response.value;
        } else {
            console.error("Error fetching blocked hostnames counter:", response.error);
            document.getElementById("blockedHostnamesCounter").innerText = "Error";
        }
    });

    // Re-fetch and update closed tabs counter
    sendMessage("getClosedTabsCounter", function (response) {
        if (response.success) {
            document.getElementById("closedTabsCounter").innerText = response.value === 0 ? "None." : response.value;
        } else {
            console.error("Error fetching closed tabs counter:", response.error);
            document.getElementById("closedTabsCounter").innerText = "Error";
        }
    });

    // Re-fetch and update most closed hostnames
    sendMessage("getMostClosedHostnames", function (response) {
        if (response && response.success) { // Ensure response.success is checked
            document.getElementById("mostClosedList").textContent = response.hostnames.length !== 0 ? response.hostnames.join(", ") : "None.";
            document.getElementById("mostClosedCounter").textContent = response.highestCounter !== null ? response.highestCounter : "None.";
        } else {
            console.error("Invalid or missing 'hostnames' or 'highestCounter' in response for most closed hostnames:", response);
            document.getElementById("mostClosedList").textContent = "Error";
            document.getElementById("mostClosedCounter").textContent = "Error";
        }
    });
}


document.addEventListener("DOMContentLoaded", function () {
    // Initialize all counters and the blocked hostnames list on page load
    updateAllCounters();

    // Event delegation for unblock buttons on the #blockedHostnames container
    document.getElementById("blockedHostnames").addEventListener("click", function(event) {
        const clickedButton = event.target.closest(".unblockHostnameButton");
        if (clickedButton) {
            const hostnameToRemove = clickedButton.dataset.hostname;
            const itemElement = clickedButton.closest('.hostnameRow');
            unblockHostname(hostnameToRemove, itemElement);
        }
    });

    // Event listener for blocking a new hostname (debounced to prevent multiple rapid submissions)
    document.getElementById("blockHostnameBtn").addEventListener("click", debounce(function() {
        const inputElement = document.getElementById("hostnameInput");
        const hostnameToBlock = inputElement.value.trim();
    
        if (!hostnameToBlock) {
            showMessage("hostnameMessage", "Please enter a valid hostname.", true);
            return;
        }
    
        chrome.runtime.sendMessage({ action: "blockHostname", hostname: hostnameToBlock }, function(response) {
            if (response && response.success) {
                // Input was successful, clear input and refresh UI.
                inputElement.value = ""; // Clear input field
                updateAllCounters(); // Refresh all stats, including the list of hostnames
                showMessage("hostnameMessage", `"${hostnameToBlock}" blocked successfully!`, false);
            } else {
                console.error("Failed to block hostname:", hostnameToBlock, response ? response.error : "Unknown error");
                showMessage("hostnameMessage", `Failed to block "${hostnameToBlock}". ${response && response.error ? response.error : ''}`, true);
            }
        });
    }, 300)); // Debounce a click with a 300ms delay

    chrome.runtime.onMessage.addListener(function(message) {
        if (message.action === "refreshOptionsPage") {
            console.log("Received refreshOptionsPage message. Updating counters.");
            updateAllCounters(); // Trigger a refresh of all data and UI
        }
    });

    // Version Info
    document.getElementById('extVersion').textContent = `ver. 0.0.3`;
});