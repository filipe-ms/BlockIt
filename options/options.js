/*                    *
 ***** OPTIONS.JS *****
 *                    */


/* Creating the blocked hostnames table */
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
    const content = values && values.length > 0
        ? buildTableContent(values)
        : `<div id="emptyList">You don't have any blocked<br>hostname to display yet.</div>`;
    
    document.getElementById("blockedHostnames").innerHTML = content;
    attachUnblockListeners(); // Attach event listeners to unblock buttons
}

function attachUnblockListeners() {
    const unblockButtons = document.querySelectorAll('.unblockHostnameButton');
    unblockButtons.forEach(button => {
        button.addEventListener('click', function() {
            const hostnameToRemove = button.dataset.hostname;
            unblockHostname(hostnameToRemove, button.closest('.hostnameRow'));
        });
    });
}

function unblockHostname(hostname, itemElement) {
    chrome.runtime.sendMessage({ action: "unblockHostname", hostname }, function(response) {
        if (response) {
            itemElement.remove();
            
            const blockedHostnamesList = document.querySelectorAll('.hostnameRow');
            if (blockedHostnamesList.length === 0) {
                document.getElementById("blockedHostnames").innerHTML = `<div id="emptyList">You don't have any blocked<br>hostname to display yet.</div>`;
            }
        } else {
            console.error("Failed to remove hostname:", hostname);
        }
    });
}

function sendMessage(action, callback) {
    chrome.runtime.sendMessage({ action: action }, function(response) {
        if (response) {
            callback(response);
        } else {
            console.error(`Failed to perform action: ${action}`, response);
        }
    });
}

function handleEmptyState(values) {
    if (values.length === 0) {
        document.getElementById("blockedHostnames").innerHTML = `<div id="emptyList">You don't have any blocked<br>hostname to display yet.</div>`;
    }
}

function debounce(func, delay) {
    let debounceTimer;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(context, args), delay);
    }
}

document.addEventListener("DOMContentLoaded", function () {
    // Load blocked hostnames
    sendMessage("getBlockedHostnames", function (response) {
        console.log("Blocked hostnames response:", response);
        handleEmptyState(response.data);
        renderBlockedHostnames(response.data);
    });

    // Display counter for blocked hostnames
    sendMessage("getBlockedHostnamesCounter", function (response) {
        if (response.success) {
            if (response.value === 0) {
                document.getElementById("blockedHostnamesCounter").innerText = "None.";
            } else {
                document.getElementById("blockedHostnamesCounter").innerText = response.value;
            }
        } else {
            console.log("Error:", response.error);
            document.getElementById("blockedHostnamesCounter").innerText = "None.";
        }
    });

    // Load tab close counter
    sendMessage("getClosedTabsCounter", function (response) {
        if (response.success) {
            if (response.value === 0) {
                document.getElementById("closedTabsCounter").innerText = "None.";
            } else {
                document.getElementById("closedTabsCounter").innerText = response.value;
            }
        } else {
            console.log("Error:", response.error);
            document.getElementById("closedTabsCounter").innerText = "None.";
        }
    });

    // Load most closed hostnames
    sendMessage("getMostClosedHostnames", function (response) {
        if (response && response.hostnames && Array.isArray(response.hostnames)) {
            document.getElementById("mostClosedList").textContent = response.hostnames.length !== 0 ? response.hostnames.join(", ") : "None.";
        } else {
            document.getElementById("mostClosedList").textContent = "None.";
            console.error("Invalid or missing 'hostnames' in response:", response);
        }
    
        if (response && response.highestCounter !== undefined) {
            document.getElementById("mostClosedCounter").textContent = response.highestCounter !== null ? response.highestCounter : "None.";
        } else {
            document.getElementById("mostClosedCounter").textContent = "None.";
            console.error("Invalid or missing 'highestCounter' in response:", response);
        }
    });

    // Block a new hostname
    document.getElementById("blockHostnameBtn").addEventListener("click", debounce(function() {
        const inputElement = document.getElementById("hostnameInput");
        const hostnameToBlock = inputElement.value.trim();
    
        if (!hostnameToBlock) {
            alert("Please enter a valid hostname.");
            return;
        }
    
        chrome.runtime.sendMessage({ action: "blockHostname", hostname: hostnameToBlock }, function(response) {
            if (response) {
                const newHostname = { address: hostnameToBlock };
                const blockedHostnamesList = document.getElementById("blockedHostnames");
    
                // Remove empty list message if present
                const emptyMessage = document.getElementById("emptyList");
                if (emptyMessage) {
                    emptyMessage.remove();
                }
    
                // Create a new element for the newly added hostname
                const newElement = document.createElement('div');
                newElement.classList.add('hostnameRow');  // Add the correct class
                newElement.innerHTML = `
                    <div class="hostname">${newHostname.address}</div>
                    <div>
                        <button class="tableBtn tooltip unblockHostnameButton" data-hostname="${newHostname.address}">
                            <i class="fa-solid fa-xmark"></i>
                            <span class="tooltiptext">Unblock</span>
                        </button>
                    </div>
                `;
    
                // Append the new element to the blocked hostnames list
                blockedHostnamesList.appendChild(newElement);
    
                inputElement.value = ""; // Clear input field
    
                // Attach event listener for unblocking the newly added hostname
                const unblockButton = newElement.querySelector('.unblockHostnameButton');
                unblockButton.addEventListener('click', function() {
                    unblockHostname(newHostname.address, newElement);
                });
            } else {
                console.error("Failed to block hostname:", hostnameToBlock);
            }
        });
    }, 300)); // Debounced click with a 300ms delay

    // Version Info
    document.getElementById('extVersion').textContent = `0.0.2 (08.10.24) First Public Release`;
});