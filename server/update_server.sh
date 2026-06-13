
# pull new server image
docker compose -f docker-compose.yml pull footdatalab
# stop server
docker compose -f docker-compose.yml down footdatalab
# start server
docker compose -f docker-compose.yml up -d --force-recreate footdatalab