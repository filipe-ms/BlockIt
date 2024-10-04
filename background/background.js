/*                       *
 ***** BACKGROUND.JS *****
 *                       */

 
/* Database */
const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open("BlockItDB", 1);

    request.onerror = (event) => {
        reject(`Failed to open database: ${event.target.error}`);
    };

    request.onsuccess = (event) => {
        const db = event.target.result;
        resolve(db);
    };

    request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains("blockedHostnames")) {
            db.createObjectStore("blockedHostnames", { keyPath: "address" });
        }

        if (!db.objectStoreNames.contains("counters")) {
            const counters = db.createObjectStore("counters", { keyPath: "counter" });

            const transaction = event.target.transaction;

            const addRequest = counters.add({ counter: "closedTabsCounter", value: 0 });
            addRequest.onsuccess = () => {
                console.log("Added 'closedTabsCounter' with default value.");
            };

            addRequest.onerror = (event) => {
                reject(`Error adding default value: ${event.target.error}`);
            };

            transaction.oncomplete = () => {
                console.log("Counters object store creation and default value addition completed.");
            };

            transaction.onerror = (event) => {
                reject(`Error creating counters object store: ${event.target.error}`);
            };
        }
    };
});

/* onStartup event listeners */

let blocklist = new Set(); // Sets are quicker for lookups and responses

const populateOnStartup = () => {
    populateBlocklist()
        .then(() => {
            console.log("Hostname block list ready:", blocklist);
        })
        .catch((error) => {
            console.error("Error retrieving blocked hostnames:", error);
        });
};

chrome.runtime.onStartup.addListener(populateOnStartup);

/* onMessage event listeners */
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    switch (message.action) {

        case "isHostnameBlocked": // Checks the set for a blocked hostname
            if (blocklist.has(message.hostname)){
                sendResponse(true);
            } else {
                sendResponse(false);
            }
        
        return true;
            
        case "updateCounters":
            updateCounters(message.hostname);
            break;

        case "getClosedTabsCounter":
            getClosedTabsCounter()
                .then((value) => {
                    sendResponse({ success: true, value: value.count });
                })
                .catch((error) => {
                    sendResponse({ success: false, error: error.message });
                });
            return true;

        case "getBlockedHostnamesCounter":
            getBlockedHostnamesCounter()
                .then((value) => {
                    sendResponse({ success: true, value: value.count });
                })
                .catch((error) => {
                    sendResponse({ success: false, error: error.message });
                });
            return true;

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
            return true;

        case "getMostClosedHostnames":
            getMostClosedHostnames()
                .then((response) => {
                    sendResponse({ success: true, hostnames: response.hostnames, highestCounter: response.highestCounter });
                })
                .catch((error) => {
                    sendResponse({ success: false, error: error.message });
                });
            return true;

        case "blockHostname":
            blockHostname(message.hostname)
                .then((result) => {
                    if (result) {
                        addToBlocklist(message.hostname)
                            .then(() => {
                                sendResponse(true);
                                if (message.tabId) {
                                    reloadTab(message.tabId);
                                }
                            })
                            .catch(error => {
                                console.error("Error adding to blocklist:", error);
                                sendResponse(false);
                            });
                    } else {
                        sendResponse(false);
                    }
                })
                .catch(error => {
                    console.error("Error blocking hostname:", error);
                    sendResponse(false);
                });
            return true;

        case "unblockHostname":
            unblockHostname(message.hostname)
                .then((result) => {
                    if (result) {
                        removeFromBlocklist(message.hostname)
                            .then(() => {
                                sendResponse(true);
                            })
                            .catch(error => {
                                console.error("Error removing from blocklist:", error);
                                sendResponse(false);
                            });
                    } else {
                        sendResponse(false);
                    }
                })
                .catch(error => {
                    console.error("Error unblocking hostname:", error);
                    sendResponse(false);
                });
            return true;
    }
});

/* Blocklist set functions */
function addToBlocklist(hostname) {
    return new Promise((resolve) => {
        blocklist.add(hostname);
        resolve();
    });
}

function removeFromBlocklist(hostname) {
    return new Promise((resolve) => {
        blocklist.delete(hostname);
        resolve();
    });
}

function populateBlocklist() {
    return new Promise((resolve, reject) => {
        dbPromise.then((db) => {
            let transaction = db.transaction(["blockedHostnames"], "readonly");
            let objectStore = transaction.objectStore("blockedHostnames");

            // openKeyCursor is used to iterate through indexedDB keys.
            let cursorRequest = objectStore.openKeyCursor();

            cursorRequest.onsuccess = function (event) {
                let cursor = event.target.result;
                if (cursor) {
                    // Add the current key to the blocklist.
                    blocklist.add(cursor.key);

                    // Move to the next key.
                    cursor.continue();
                } else {
                    console.log("No more keys");
                    resolve(); // Resolve the promise when iteration is complete
                }
            };

            cursorRequest.onerror = function (event) {
                console.error("Error iterating keys:", event.target.error);
                reject(event.target.error); // Reject the promise on error
            };
        }).catch(error => {
            console.error("Error accessing IndexedDB:", error);
            reject(error); // Reject the promise on error
        });
    });
}

/* Other hostname-related functions */
function updateCounters(location) {
    incrementClosedTabsCounter();
    incrementPageCloseCounter(location);
}

async function incrementPageCloseCounter(location) {
    if (!location || typeof location !== "string") {
        console.error("Invalid location:", location);
        return;
    }

    try {
        const db = await dbPromise;
        const transaction = db.transaction(["blockedHostnames"], "readwrite");
        const storage = transaction.objectStore("blockedHostnames");
        
        const blockedHostname = await new Promise((resolve, reject) => {
            const getRequest = storage.get(location);
            getRequest.onsuccess = event => resolve(event.target.result);
            getRequest.onerror = event => reject(new Error("Error retrieving hostname:", event.target.error));
        });

        if (blockedHostname) {
            // Increment the blockedCount
            blockedHostname.blockedCount++;
            await new Promise((resolve, reject) => {
                const updateRequest = storage.put(blockedHostname);
                updateRequest.onsuccess = resolve;
                updateRequest.onerror = event => reject(new Error("Error updating count:", event.target.error));
            });
            console.log(`Blocked count incremented for ${location}: ${blockedHostname.blockedCount}`);
        } else {
            console.error("This page is not blocked!:", location);
        }

        console.log("Transaction completed successfully.");
        return true; // Indicate success
    } catch (error) {
        console.error("Error accessing database:", error);
        throw new Error("Error accessing database:", error);
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

function getClosedTabsCounter() {
    return new Promise((resolve, reject) => {
        dbPromise
            .then((db) => {
                let transaction = db.transaction(["counters"], "readonly");
                let store = transaction.objectStore("counters");

                let getRequest = store.get("closedTabsCounter");

                getRequest.onsuccess = function (event) {
                    console.log("getRequest result:", event.target.result);
                    if (event.target.result && event.target.result.value !== undefined) {
                        resolve({ success: true, count: event.target.result.value });
                    } else {
                        console.log("Should have returned zero");
                        resolve({ success: true, count: 0 });
                    }
                };

                getRequest.onerror = function (event) {
                    console.error("Error retrieving closedTabsCounter:", event.target.error);
                    reject(new Error("Failed to retrieve closedTabsCounter"));
                };
            })
            .catch((error) => {
                console.error("Error in dbPromise:", error);
                reject(error);
            });
    });
}

function getBlockedHostnamesCounter() {
    return new Promise((resolve, reject) => {
        dbPromise
            .then((db) => {
                let transaction = db.transaction(["blockedHostnames"], "readonly");
                let store = transaction.objectStore("blockedHostnames");

                let getRequest = store.getAll();

                getRequest.onsuccess = function (event) {
                    let blockedHostnames = event.target.result || [];
                    resolve({ success: true, count: blockedHostnames.length });
                };

                getRequest.onerror = function (event) {
                    console.error("Failed to retrieve blocked hostnames:", event.target.error);
                    reject(event.target.error);
                };
            })
            .catch((error) => {
                console.error("Error in dbPromise:", error);
                reject(error);
            });
    });
}

function getBlockedHostnames() {
    return new Promise((resolve, reject) => {
        dbPromise
            .then((db) => {
                console.log("Database opened successfully");
                let transaction = db.transaction(["blockedHostnames"], "readonly");
                let store = transaction.objectStore("blockedHostnames");

                let getRequest = store.getAll();

                getRequest.onsuccess = function (event) {
                    let blockedHostnames = event.target.result || [];
                    resolve(blockedHostnames);
                };

                getRequest.onerror = function (event) {
                    console.error("Failed to retrieve blocked hostnames");
                    reject("Failed to retrieve blocked hostnames");
                };
            })
            .catch((error) => {
                console.error("Error opening database:", error);
                reject(error);
            });
    });
}

function getMostClosedHostnames() {
    return new Promise((resolve, reject) => {
        dbPromise.then((db) => {
            const transaction = db.transaction(["blockedHostnames"], "readonly");
            const objectStore = transaction.objectStore("blockedHostnames");
            const cursorRequest = objectStore.openCursor();

            let highestCounter = -Infinity;
            let hostnamesWithHighestCount = [];

            cursorRequest.onsuccess = function (event) {
                const cursor = event.target.result;

                if (cursor) {
                    const currentName = cursor.value.address;
                    const currentValue = cursor.value.blockedCount;

                    if (currentValue > highestCounter) {
                        highestCounter = currentValue;
                        hostnamesWithHighestCount = [currentName];
                    } else if (currentValue === highestCounter) {
                        hostnamesWithHighestCount.push(currentName);
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
                console.error("Error iterating keys:", event.target.error);
                reject(event.target.error); // Reject the promise on error
            };
        }).catch(error => {
            console.error("Error accessing IndexedDB:", error);
            reject(error); // Reject the promise on error
        });
    });
}

function blockHostname(name) {
    return new Promise((resolve, reject) => {
        if (!name || typeof name !== "string") {
            return reject(new Error("Invalid hostname: " + name));
        }

        dbPromise
            .then((db) => {
                const transaction = db.transaction(["blockedHostnames"], "readwrite");
                const storage = transaction.objectStore("blockedHostnames");

                // Add the hostname with default blockedCount
                const addRequest = storage.add({ address: name, blockedCount: 0 });

                addRequest.onsuccess = () => {
                    console.log("Hostname blocked successfully:", name);
                    resolve(true);
                };

                addRequest.onerror = (event) => {
                    reject(new Error("Error adding hostname: " + event.target.error));
                };

                transaction.onerror = (event) => {
                    reject(new Error("Transaction error: " + event.target.error));
                };
            })
            .catch((error) => {
                reject(new Error("Error accessing database: " + error));
            });
    });
}

function unblockHostname(name) {
    return new Promise((resolve, reject) => {
        if (!name || typeof name !== "string") {
            reject(new Error("Invalid hostname: " + name));
            return;
        }

        dbPromise
            .then((db) => {
                // Start a new transaction on the 'blockedHostnames' object store
                let transaction = db.transaction(["blockedHostnames"], "readwrite");
                let store = transaction.objectStore("blockedHostnames");

                let deleteRequest = store.delete(name);

                deleteRequest.onsuccess = function (event) {
                    console.log("Hostname unblocked successfully:", name);
                    resolve(true);
                };

                deleteRequest.onerror = function (event) {
                    console.error("Failed to unblock hostname:", event.target.error);
                    reject("Failed to unblock hostname:", name);
                };

                transaction.oncomplete = function () {
                    console.log("Transaction completed successfully.");
                };

                transaction.onerror = function (event) {
                    console.error("Transaction error:", event.target.error);
                    reject("Transaction error:", event.target.error);
                };
            })
            .catch((error) => {
                console.error("Error accessing database:", error);
                reject(error);
            });
    });
}

/* Other functions */
function reloadTab(tabId) {
    chrome.tabs.reload(tabId, {}, () => {
        if (chrome.runtime.lastError) {
            console.error("Error: Could not reload tab.", chrome.runtime.lastError);
        } else {
            console.log("Tab reloaded successfully.");
        }
    });
}

