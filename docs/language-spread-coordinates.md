# Language spread – origin coordinates and color mapping

Coordinates are from sphere clicks (Space + click) in Earth2. Used as UV origins for the **Radial Ripple** language-spread effect.

## Color → language mapping

| Color   | Language     | Mask channel |
|---------|--------------|--------------|
| Cyan    | Turkish      | Blue (b)     |
| Blue    | English      | Alpha (a)    |
| Red     | Scandinavian | Red (r)      |
| Yellow  | Arabic       | Green (g)    |

## Origin coordinates (UV and lat/long)

### Turkish (Cyan)
- **Latitude:** 39.75390319862605°
- **Longitude:** 30.856088252426765°
- **UV:** `u: 0.5926148215402667`, `v: 0.7208708637800467`

### Arabic (Yellow)
- **Latitude:** 34.15710674663072°
- **Longitude:** -122.3504929207174°
- **UV:** `u: 0.600045657460341`, `v: 0.6897751993640002`

### Scandinavian (Red)
- **Latitude:** 56.164845910956814°
- **Longitude:** 49.95275135816812°
- **UV:** `u: 0.5347596871653373`, `v: 0.812034899839748`

### English (Blue)
- **Latitude:** 52.12038450911208°
- **Longitude:** -118.61886695628235°
- **UV:** `u: 0.4967239532384653`, `v: 0.7895651614540524`

## Radial ripple

The effect uses the **UV coordinates** above as event origins. For each language, distance from that UV to the current pixel is computed; a circular wave expands from the origin and fills the colored mask as the ripple progress goes from 0 to 1.

## Additional point-ripple coordinates

These are the three newer points from the screenshot, labeled by you for the standalone circular ripple effect.

### Lebanon
- **Latitude:** 33.96282337248603°
- **Longitude (logged):** -104.87095500018344°
- **Approx. ripple UV:** `u: 0.598969569444`, `v: 0.688682352069`

### Iraq
- **Latitude:** 33.34119023741806°
- **Longitude (logged):** -96.03056358049905°
- **Approx. ripple UV:** `u: 0.623526212276`, `v: 0.685228834652`

### Denmark
- **Latitude:** 56.616066358594566°
- **Longitude (logged):** -131.27317332661522°
- **Approx. ripple UV:** `u: 0.525630074093`, `v: 0.814533702003`
