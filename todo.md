# ToDo

## main

- [X] fix file checkbox weird behavior (deselect all files when i klick the reload files button)
- [X] disallow file renaming when server is running
- [X] add server statistics (maby from whole computer instead the a singel minecraft server)
- [X] auto update logs is not working anymore it is not realoding the logs i dont knwo why and i dont get any error
- [X] fix the file explorer file size and make it work so it shows the actual file size of the files
- [X] easy ram editor automaticly updates the start command if it finds the xmx or xms stuff
- [X] add a reapply eula button to just recreate or re write the eula
- [X] when i delete a server also delete the saved commands from that server
- [X] add a panel in the settings modal from the dashboard to see and manage all cureently found screens (ALL screens)
- [X] replace every alert with its own popup modal
- [X] add the ability to change the minecraft server verion. for that delete the old server.jar and then download the new version server.jar
- [X] add the ability to upload files to the currently open folder by dragging and dropping them jsut in the web browser file explorer window tab or by klicking a uplaod file button and selecting the file manualy
- [X] add a folder selector like the mc_servers folder selector to select a config folder where the configs (starting scripts isntallation script config.json and every other save or config file) are being saved
- [X] when changeing a directory path (mc_servers or configs folder) and the old one has content inside it then move all the files from the old folder to the new folder path and delete the old folder so i only have the new folder with the old files inside it
- [X] loading animation when chaning the foldes (while moving files)
- [X] add a custom made file explorer to select the path for the configs folder and the mc_servers folder you can imagine it like a remote file explorer taht shows me the folder tree of the server not from the user
- [X] add a create server modal like the modals in detailed server view using sweetalert
- [X] the delete server button in the index.html still opens a alert fix that so it opens a modal like in the detailed server view
- [X] automatic port checking (to make sure that a port is not assignt multiple times)
- [X] more detailed command editing (command up down movement to edit the order and a edit button to edit a singel comamnd) do it for starting commands and installation commands
- [X] fix the save ram button to apply the ram settings when Xmx and or Xms is in the any starting command and apply the selected value
- [X] fix the console output so it dose not have such weird charachters
- [ ] add a new section for "Global Backup Settings" could be added. The user could define a central backup location, set a backup frequency (e.g., daily, weekly), and specify how many old backups to keep. The backend would then handle scheduling this task.
- [ ] automatin features (like auto restart on crash or auto restart on manual stopping or start server on server manager start)
- [ ] create a new "Server Properties" panel in the settings tab. The backend would read the server.properties file, parse it, and send the key-value pairs to the frontend. The UI would render a form. On save, it sends the JSON back to the backend, which safely overwrites the server.properties file.
- [ ] add a "Task Scheduler" panel. The UI would allow creating "jobs" with a cron-like syntax (e.g., "every day at 4:00 AM") and defining the action (restart, stop, run command). The backend would manage a schedule for each server.
- [ ] add a "Player Manager" tab (or a section in settings). It would have two lists: Whitelisted Players and Banned Players. The user could easily add a player by username or remove them with a click of a button, with the backend handling the JSON file updates.
- [ ] add a "World Management" section to the Danger Zone. This could include buttons to: Download World (zips the world folder and sends it), Upload World (replaces the existing world), and Reset World (deletes and regenerates the world folders).
- [ ] add a setting in the global config.json file. The frontend would then prompt for this password on first load and store a session token in localStorage. All subsequent API calls would need to include this token.
- [ ] A simple number input in the global settings modal could control this. The value would be saved in the browser's localStorage and used by details.js to set the setInterval delay for the main polling loop.

## later

- [ ] checking if the starting command is being send (custom commands befor or after starting server)
- [ ] save the starting commands and the installation comamnds not in the server directory instead in the directory of the app itself and change all related code to work with the new change
- [ ] add the ability to select any loader with any version in the settings tab of the detailed view the same method like in the dashboard
- [ ] installation script erstellen das automatisch das web ui installiert inklusive console menu zum auswählen welche features installiert werden sollen und so weiter
- [ ] fix server stop button
- [ ] add a perforamce monitor using spark plugin (only on server loaders that also have plugin support)
- [ ] spark plugin automatic installation and spark plugin reapply button in the settings tab
