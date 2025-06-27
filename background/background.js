/*                       *
 ***** BACKGROUND.JS *****
 *                       */

 
/* Database */
const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open("BlockItDB", 1);

    request.onerror = (event) => {
        console.error("Failed to open database:", event.target.error);
        reject(new Error(`Failed to open database: ${event.target.error.name}`));
    };

    request.onsuccess = (event) => {
        const db = event.target.result;
        resolve(db);
    };

    request.onupgradeneeded = (event) => {
        const db = event.target.result;
        let transaction = event.target.transaction;

        // Create the 'blockedHostnames' object store if it doesn't exist
        if (!db.objectStoreNames.contains("blockedHostnames")) {
            db.createObjectStore("blockedHostnames", { keyPath: "address" });
            console.log("Object store 'blockedHostnames' created.");
        }

        if (!db.objectStoreNames.contains("counters")) {
            const counters = db.createObjectStore("counters", { keyPath: "counter" });
            console.log("Object store 'counters' created.");

            const addCounterRequest = counters.put({ counter: "closedTabsCounter", value: 0 });

            addCounterRequest.onsuccess = () => {
                console.log("Added 'closedTabsCounter' with default value.");
            };
            addCounterRequest.onerror = (event) => {
                console.error("Error adding default value for closedTabsCounter:", event.target.error);
            };

        }

        transaction.oncomplete = () => {
            console.log("Database upgrade transaction completed.");
        };

        transaction.onerror = (event) => {
            console.error("Error during database upgrade transaction:", event.target.error);
            reject(new Error(`Error creating object store: ${event.target.error.name}`));
        };
    };
});

/* onStartup event listeners */

// In-memory cache: sets are quicker for lookups and responses
let blocklist = new Set();

// Populate the blocklist from IndexedDB on startup
const populateOnStartup = () => {
    populateBlocklist()
        .then(() => {
            console.log("Hostname block list ready:", blocklist);
        })
        .catch((error) => {
            console.error("Error retrieving blocked hostnames on startup:", error);
        });
};

// Listen for the extension onStartup event to populate the blocklist
chrome.runtime.onStartup.addListener(populateOnStartup);

// Helper to send messages to open extension pages
function sendOptionsPageRefreshMessage() {
    chrome.runtime.sendMessage({ action: "refreshOptionsPage" }, function() {
        if (chrome.runtime.lastError) {
            // Check if the error is specifically because the receiving end does not exist,
            // or if the message port closed without a response (which is expected for one-way).
            if (chrome.runtime.lastError.message &&
                !chrome.runtime.lastError.message.includes("Receiving end does not exist") &&
                !chrome.runtime.lastError.message.includes("The message port closed before a response was received")) {
                console.error("Error sending refreshOptionsPage message:", chrome.runtime.lastError.message);
            }
        }
    });
}

/* onMessage event listeners */

// Listener for messages from other parts of the extension (popup, options, content script).
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {

    // Returns true to indicate that the response will be sent asynchronously.
    let handled = true; 

    switch (message.action) {
        case "isHostnameBlocked": // Checks the set for a blocked hostname
            sendResponse(blocklist.has(message.hostname));
            break;

        case "updateCounters":
            updateCounters(message.hostname)
                .then(() => {
                    // After updating counters, notify options page.
                    sendOptionsPageRefreshMessage();
                })
                .catch(error => {
                    console.error("Error updating counters:", error);
                });
            handled = false; // Not awaiting a response for this one from content script.
            break;

        case "getClosedTabsCounter":
            getClosedTabsCounter()
                .then((value) => {
                    sendResponse({ success: true, value: value.count });
                })
                .catch((error) => {
                    console.error("Error getting closed tabs counter:", error);
                    sendResponse({ success: false, error: error.message });
                });
            break;

        case "getBlockedHostnamesCounter":
            getBlockedHostnamesCounter()
                .then((value) => {
                    sendResponse({ success: true, value: value.count });
                })
                .catch((error) => {
                    console.error("Error getting blocked hostnames counter:", error);
                    sendResponse({ success: false, error: error.message });
                });
            break;

        case "getBlockedHostnames":
            getBlockedHostnames()
                .then((response) => {
                    console.log("Blocked hostnames fetched:", response);
                    sendResponse({ success: true, data: response });
                })
                .catch((error) => {
                    console.error("Error fetching blocked hostnames:", error);
                    sendResponse({ success: false, error: error.message });
                });
            break;

        case "getMostClosedHostnames":
            getMostClosedHostnames()
                .then((response) => {
                    sendResponse({ success: true, hostnames: response.hostnames, highestCounter: response.highestCounter });
                })
                .catch((error) => {
                    console.error("Error getting most closed hostnames:", error);
                    sendResponse({ success: false, error: error.message });
                });
            break;

        case "blockHostname":
            blockHostname(message.hostname)
                .then((result) => {
                    if (result) {
                        // Update in-memory blocklist ONLY after successful DB operation.
                        addToBlocklist(message.hostname);
                        sendResponse({ success: true });
                        if (message.tabId) {
                            reloadTab(message.tabId);
                        }
                        // Also notify options page if a new hostname was blocked
                        sendOptionsPageRefreshMessage();
                    } else {
                        sendResponse({ success: false, error: "Failed to add hostname to database." });
                    }
                })
                .catch(error => {
                    console.error("Error blocking hostname:", error);
                    sendResponse({ success: false, error: error.message });
                });
            break;

        case "unblockHostname":
            unblockHostname(message.hostname)
                .then((result) => {
                    if (result) {
                        // Update in-memory blocklist ONLY after successful DB operation.
                        removeFromBlocklist(message.hostname);
                        sendResponse({ success: true });
                        // Also notify options page if a hostname was unblocked
                        sendOptionsPageRefreshMessage();
                    } else {
                        sendResponse({ success: false, error: "Failed to remove hostname from database." });
                    }
                })
                .catch(error => {
                    console.error("Error unblocking hostname:", error);
                    sendResponse({ success: false, error: error.message });
                });
            break;

        default:
            handled = false; // Message action not recognized. Shouldn't wait for a response.
            console.warn("Unhandled message action:", message.action);
            break;
    }

    return handled;
});

/* Blocklist set operations */

// Adds a hostname to the in-memory blocklist.
function addToBlocklist(hostname) {
    blocklist.add(hostname);
    console.log(`Added ${hostname} to in-memory blocklist.`);
}

// Removes a hostname from the in-memory blocklist.
function removeFromBlocklist(hostname) {
    blocklist.delete(hostname);
    console.log(`Removed ${hostname} from in-memory blocklist.`);
}

function populateBlocklist() {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await dbPromise; // Ensure database is open.
            const transaction = db.transaction(["blockedHostnames"], "readonly");
            const objectStore = transaction.objectStore("blockedHostnames");

            // Use openCursor to iterate through all entries.
            const cursorRequest = objectStore.openCursor();

            cursorRequest.onsuccess = function (event) {
                const cursor = event.target.result;
                if (cursor) {
                    blocklist.add(cursor.value.address); // Add the hostname to the Set.
                    cursor.continue(); // Move to the next entry.
                } else {
                    console.log("In-memory blocklist populated from IndexedDB.");
                    resolve(); // Resolve the promise when iteration is complete.
                }
            };

            cursorRequest.onerror = function (event) {
                console.error("Error iterating through blocked hostnames for population:", event.target.error);
                reject(new Error(`Failed to iterate hostnames: ${event.target.error.name}`));
            };
        } catch (error) {
            console.error("Error accessing IndexedDB for populateBlocklist:", error);
            reject(new Error(`Database access error: ${error.message}`));
        }
    });
}

/* Counter and Hostname-related Database Functions */

// Updates the counters for closed tabs and blocked hostnames.
async function updateCounters(hostname) {
    await Promise.allSettled([
        incrementClosedTabsCounter(),
        incrementPageCloseCounter(hostname)
    ]).then(results => {
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`Error updating counter ${index === 0 ? 'closedTabsCounter' : 'pageCloseCounter'}:`, result.reason);
            }
        });
    });
}

// Increments the blockedCount for a specific hostname in the database.
async function incrementPageCloseCounter(location) {
    if (!location || typeof location !== "string") {
        console.error("Invalid location provided to incrementPageCloseCounter:", location);
        throw new Error("Invalid hostname for counter update.");
    }

    try {
        const db = await dbPromise;
        const transaction = db.transaction(["blockedHostnames"], "readwrite");
        const storage = transaction.objectStore("blockedHostnames");

        // Retrieve the hostname entry.
        const blockedHostname = await new Promise((resolve, reject) => {
            const getRequest = storage.get(location);
            getRequest.onsuccess = event => resolve(event.target.result);
            getRequest.onerror = event => reject(new Error("Error retrieving hostname for count update", { cause: event.target.error }));
        });

        if (blockedHostname) {
            // Increment the blockedCount.
            blockedHostname.blockedCount = (blockedHostname.blockedCount || 0) + 1; // Ensure count starts at 0 if not present.
            await new Promise((resolve, reject) => {
                const updateRequest = storage.put(blockedHostname); // Update the record.
                updateRequest.onsuccess = resolve;
                updateRequest.onerror = event => reject(new Error("Error updating count for hostname", { cause: event.target.error }));
            });
            console.log(`Blocked count incremented for ${location}: ${blockedHostname.blockedCount}`);
            return true;
        } else {
            console.warn(`Attempted to increment counter for unblocked page: ${location}`);
            return false; // Hostname not found in blocked list.
        }
    } catch (error) {
        console.error("Error in incrementPageCloseCounter:", error);
        throw new Error(`Failed to update page close counter: ${error.message}`, { cause: error });
    }
}

async function incrementClosedTabsCounter() {
    try {
        const db = await dbPromise;
        const transaction = db.transaction(["counters"], "readwrite");
        const store = transaction.objectStore("counters");

        // Retrieve the current closedTabsCounter value
        const currentCounter = await new Promise((resolve, reject) => {
            const getRequest = store.get("closedTabsCounter");
            getRequest.onsuccess = event => resolve(event.target.result?.value ?? 0);
            getRequest.onerror = () => reject(new Error("Failed to retrieve closedTabsCounter"));
        });

        // Increment the counter value
        const newValue = currentCounter + 1;

        // Update the closedTabsCounter in IndexedDB
        await new Promise((resolve, reject) => {
            const putRequest = store.put({ counter: "closedTabsCounter", value: newValue });
            putRequest.onsuccess = () => resolve({ success: true });
            putRequest.onerror = () => reject(new Error("Failed to update closedTabsCounter"));
        });

        return { success: true };
    } catch (error) {
        console.error("Error in updating closedTabsCounter:", error);
        return { success: false, error: error.message };
    }
}


// Retrieves the current count of closed tabs from IndexedDB.
// Returns {Promise<{ success: boolean, count: number, error?: string }>}
function getClosedTabsCounter() {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await dbPromise;
            const transaction = db.transaction(["counters"], "readonly");
            const store = transaction.objectStore("counters");

            const getRequest = store.get("closedTabsCounter");

            getRequest.onsuccess = function (event) {
                const count = event.target.result?.value ?? 0;
                resolve({ success: true, count: count });
            };

            getRequest.onerror = function (event) {
                console.error("Error retrieving closedTabsCounter:", event.target.error);
                reject(new Error("Failed to retrieve closedTabsCounter.", { cause: event.target.error }));
            };
        } catch (error) {
            console.error("Error accessing database for getClosedTabsCounter:", error);
            reject(new Error(`Database access error: ${error.message}`));
        }
    });
}

// Retrieves the count of blocked hostnames from IndexedDB.
// Returns {Promise<{ success: boolean, count: number, error?: string }>}
function getBlockedHostnamesCounter() {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await dbPromise;
            const transaction = db.transaction(["blockedHostnames"], "readonly");
            const store = transaction.objectStore("blockedHostnames");

            const getRequest = store.getAll(); // Get all records.

            getRequest.onsuccess = function (event) {
                const blockedHostnames = event.target.result || [];
                resolve({ success: true, count: blockedHostnames.length });
            };

            getRequest.onerror = function (event) {
                console.error("Failed to retrieve blocked hostnames for counter:", event.target.error);
                reject(new Error("Failed to retrieve blocked hostnames counter.", { cause: event.target.error }));
            };
        } catch (error) {
            console.error("Error accessing database for getBlockedHostnamesCounter:", error);
            reject(new Error(`Database access error: ${error.message}`));
        }
    });
}

// Retrieves all blocked hostnames from IndexedDB.
// Returns {Promise<Array<{ address: string, blockedCount: number }>>}
function getBlockedHostnames() {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await dbPromise;
            const transaction = db.transaction(["blockedHostnames"], "readonly");
            const store = transaction.objectStore("blockedHostnames");

            const getRequest = store.getAll();

            getRequest.onsuccess = function (event) {
                const blockedHostnames = event.target.result || [];
                resolve(blockedHostnames);
            };

            getRequest.onerror = function (event) {
                console.error("Failed to retrieve blocked hostnames:", event.target.error);
                reject(new Error("Failed to retrieve blocked hostnames from database.", { cause: event.target.error }));
            };
        } catch (error) {
            console.error("Error accessing database for getBlockedHostnames:", error);
            reject(new Error(`Database access error: ${error.message}`));
        }
    });
}


// Retrieves the most closed hostnames from IndexedDB.
// Returns {Promise<{hostnames: string[], highestCounter: number}>}
function getMostClosedHostnames() {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await dbPromise;
            const transaction = db.transaction(["blockedHostnames"], "readonly");
            const objectStore = transaction.objectStore("blockedHostnames");
            const cursorRequest = objectStore.openCursor();

            let highestCounter = 0; // Initialize with 0 as counts won't be negative.
            let hostnamesWithHighestCount = [];

            cursorRequest.onsuccess = function (event) {
                const cursor = event.target.result;

                if (cursor) {
                    const currentName = cursor.value.address;
                    const currentValue = cursor.value.blockedCount || 0; // Ensure 0 if not set.

                    if (currentValue > highestCounter) {
                        highestCounter = currentValue;
                        hostnamesWithHighestCount = [currentName]; // New highest, reset list.
                    } else if (currentValue === highestCounter) {
                        hostnamesWithHighestCount.push(currentName); // Same highest, add to list.
                    }
                    cursor.continue();
                } else {
                    resolve({
                        hostnames: hostnamesWithHighestCount,
                        highestCounter: highestCounter
                    });
                }
            };

            cursorRequest.onerror = function (event) {
                console.error("Error iterating keys for most closed hostnames:", event.target.error);
                reject(new Error("Failed to get most closed hostnames.", { cause: event.target.error }));
            };
        } catch (error) {
            console.error("Error accessing IndexedDB for getMostClosedHostnames:", error);
            reject(new Error(`Database access error: ${error.message}`));
        }
    });
}



// Blocks a hostname by adding it to the IndexedDB.
// Returns {Promise<boolean>}
function blockHostname(name) {
    return new Promise(async (resolve, reject) => {
        if (!name || typeof name !== "string" || name.trim() === "") {
            return reject(new Error("Invalid hostname provided for blocking."));
        }

        try {
            const db = await dbPromise;
            const transaction = db.transaction(["blockedHostnames"], "readwrite");
            const storage = transaction.objectStore("blockedHostnames");

            // Add the hostname with default blockedCount
            // Use put to handle cases where an item might exist if it was partially added or corrupted
            const addRequest = storage.put({ address: name, blockedCount: 0 });

            addRequest.onsuccess = () => {
                console.log("Hostname blocked successfully in DB:", name);
                resolve(true);
            };

            addRequest.onerror = (event) => {
                // Check if the error is due to a unique constraint violation (already exists)
                if (event.target.error.name === "ConstraintError") {
                    console.warn("Hostname already blocked:", name);
                    resolve(true); // Treat as success if already exists
                } else {
                    console.error("Error adding hostname to DB:", event.target.error);
                    reject(new Error(`Error adding hostname to database: ${event.target.error.name}`, { cause: event.target.error }));
                }
            };

            transaction.onerror = (event) => {
                console.error("Transaction error during blockHostname:", event.target.error);
                reject(new Error(`Transaction error during blockHostname: ${event.target.error.name}`, { cause: event.target.error }));
            };
        } catch (error) {
            console.error("Error accessing database for blockHostname:", error);
            reject(new Error(`Database access error: ${error.message}`));
        }
    });
}

// Unblocks a hostname by removing it from the IndexedDB.
// Returns {Promise<boolean>}
function unblockHostname(name) {
    return new Promise(async (resolve, reject) => {
        if (!name || typeof name !== "string" || name.trim() === "") {
            return reject(new Error("Invalid hostname provided for unblocking."));
        }

        try {
            const db = await dbPromise;
            const transaction = db.transaction(["blockedHostnames"], "readwrite");
            const store = transaction.objectStore("blockedHostnames");

            const deleteRequest = store.delete(name);

            deleteRequest.onsuccess = function (event) {
                console.log("Hostname unblocked successfully from DB:", name);
                resolve(true);
            };

            deleteRequest.onerror = function (event) {
                console.error("Failed to unblock hostname from DB:", event.target.error);
                reject(new Error(`Failed to unblock hostname: ${event.target.error.name}`, { cause: event.target.error }));
            };

            transaction.oncomplete = function () {
                console.log("Unblock transaction completed successfully.");
            };

            transaction.onerror = function (event) {
                console.error("Transaction error during unblockHostname:", event.target.error);
                reject(new Error(`Transaction error during unblockHostname: ${event.target.error.name}`, { cause: event.target.error }));
            };
        } catch (error) {
            console.error("Error accessing database for unblockHostname:", error);
            reject(new Error(`Database access error: ${error.message}`));
        }
    });
}

/* Other functions */

// Reloads a tab by its ID.
function reloadTab(tabId) {
    chrome.tabs.reload(tabId, {}, () => {
        if (chrome.runtime.lastError) {
            console.error("Error: Could not reload tab.", chrome.runtime.lastError.message);
        } else {
            console.log("Tab reloaded successfully.");
        }
    });
}