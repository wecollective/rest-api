# authentication

https://www.youtube.com/watch?v=Ud5xKCYQTjM
https://www.youtube.com/watch?v=7Q17ubqLfaM
https://youtu.be/-RCnNyD0L-s
https://youtu.be/mbsmsi7l3r4

https://youtu.be/iD49_NIQ-R4

https://www.youtube.com/watch?v=-Z57Ss_uiuc

### Generate random key

require('crypto').randomBytes(64).toString('hex')

### No space left on server

# usual cause: log files (access.log & pm2 logs)

https://serverfault.com/questions/330532/xvda1-is-100-full-what-is-it-how-to-fix

# display total used & available disk space

df -h

# list folders and files in order of size

sudo du -x -h / | sort -h | tail -40

# flush pm2 logs

pm2 flush
