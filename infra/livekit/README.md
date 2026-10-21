# LiveKit and TURN deployment

The API issues room-scoped LiveKit participant JWTs with a 60-second initial-connect TTL. The
LiveKit API secret remains on the API server. Participant identity is an opaque session-scoped
hash; no account identifier or profile data is placed in the LiveKit identity or room name.

`livekit.example.yaml` is a production configuration template for the embedded TURN/TLS and
TURN/UDP service. Replace its example host, Redis address, API credentials, and certificate paths
with deployment values. The TURN TLS certificate must be issued by a trusted CA, and DNS/firewall
rules must expose the signaling, media, and TURN ports. The development Compose service uses
LiveKit's `--dev` mode and does not enable TURN; do not use that profile for production.

Video access remains denied while `GATE:RANDOM_VIDEO` is OFF. The token endpoint also depends on
the mutual-consent verifier, which denies by default until P3-02 wires in the consent handshake.
