const fs = require('fs');
let code = fs.readFileSync('src/hooks/usePushNotifications.js', 'utf8');

code = code.replace(
  "alert(`Call ended (${statusData.status})`);",
  "alert(`Call ended (${statusData.status})`);\n            PushNotifications.removeAllDeliveredNotifications();"
);

code = code.replace(
  "// We just let it silently background/stay there",
  "// We just let it silently background/stay there\n            PushNotifications.removeAllDeliveredNotifications();"
);

fs.writeFileSync('src/hooks/usePushNotifications.js', code);
