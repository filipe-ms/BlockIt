/*                    *
 ***** CONTENT.JS *****
 *                    */


/* Tab Checker */

/* Opening a new tab in Chrome and other browsers unavoidably makes the new   *
 * tab the active one, so there's no need of managing tab IDs and terminating *
 * specific tabs, which would otherwise be slower.                            */

function checkForBlockedHostname() {
    chrome.runtime.sendMessage(
        { action: "isHostnameBlocked", hostname: location.hostname },
        function (response) {
            if(response){
                chrome.runtime.sendMessage({ action: "updateCounters", hostname: location.hostname });
                window.close();
            }
        }
    );
}

checkForBlockedHostname();