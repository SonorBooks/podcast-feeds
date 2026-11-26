# RSS del catálogo de Brasil («Audiolivros grátis em português»)

Un pódcast con un episodio por obra de `sonorbooks.com/br/`: el mismo audio corto (CTA de ElevenLabs) en todos, la portada de cada obra (640×640) y el enlace a su ficha. Mismo formato que los demás países (`docs/procesos/rss-catalogo.md` en `SonorBooks/central`). Encargo de Joan del 26/11/2026.

## Dónde vive

| Qué | Dónde |
| --- | --- |
| Catálogo | Servidor de la web (VPS `srv2192016`), versión activa de `countries/br` (el 26/11: `br-captura14-20261125`, 110.714 obras tras quitar 189 repetidas y las exclusiones de la web). No se rastrea la web |
| Trabajo en el servidor | `~/sonorbooks-br-rss-20261126/` (`rss_br.mjs`, `correr.sh`, `.env` con las claves, logs y estado) |
| Portadas, audio y feeds | Cloudflare de **Brasil** (cuenta `brasil@sonorbooks.com`, no la de siempre), R2 `sonorbooks-catalogo-br`, público en `https://pub-f98c7ebaa8294cd7bcc0d4d7b3b7a16c.r2.dev` (`covers/`, `audio/`, `rss/`, `podcast-cover.jpg`) |
| URL que se da a Spotify y YouTube | `https://sonorbooks.github.io/podcast-feeds/br/feed-NN.xml` (copia diaria de `mirror.py`: Spotify no acepta feeds en `r2.dev` ni `workers.dev`) |
| Clave de R2 | Token «rss-catalogo-br-servidor»: lectura y escritura solo en ese bucket y solo desde la IP del servidor. Está únicamente en el `.env` del servidor (`chmod 600`). Nunca en Git ni en el chat |

## Cómo se ejecuta

En el servidor (consola web de hPanel → `sudo -iu u549896831`):

```bash
cd ~/sonorbooks-br-rss-20261126
./correr.sh exportar    # catálogo activo -> obras.json
(setsid ./correr.sh portadas >> portadas.log 2>&1 < /dev/null &)   # horas; reanudable
./correr.sh feeds && ./correr.sh subir && ./correr.sh verificar
```

`correr.sh` lanza Node con prioridad baja (`nice`, `ionice`) para no frenar la web, y con IPv4: el token solo admite la IPv4 del servidor y Node sale por IPv6 si no se fuerza.

## Textos

- Pódcast: «Audiolivros grátis em português Vol. NN»; idioma `pt-br`; Arts › Books; dueño `brasil@sonorbooks.com`.
- Episodio: «Audiolivro: {título} - {autor} Audiolivro - {título} Audiolivro»; descripción «OUÇA O AUDIOLIVRO COMPLETO GRÁTIS AQUI 👉 {ficha} *Sujeito a termos e condições.»; `guid` `sonorbooks-br:<id de la obra>`.
- Audio (pendiente): «Para ouvir este audiolivro completo grátis, abra o link na descrição. Você pode ouvir sem pagar nada ou comparar os testes grátis das principais plataformas. Sujeito a termos e condições.» Voz Davi Andrei (pt-BR), Eleven v4.
- Portada del pódcast: `podcast-cover-audiolivros-gratis.jpg` (`crear_portada.py … br`, mismo diseño que los demás países).

Si el catálogo crece, las obras nuevas van a volúmenes nuevos: regenerar desde cero movería episodios de volumen.
