"""Script para generar el icono de la extension."""
import struct, zlib, base64

def create_png(width, height, pixels_fn):
    def pack_chunk(name, data):
        c = zlib.crc32(name + data) & 0xffffffff
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', c)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    ihdr = pack_chunk(b'IHDR', ihdr_data)

    raw_rows = []
    for y in range(height):
        row = b'\x00'
        for x in range(width):
            r, g, b = pixels_fn(x, y, width, height)
            row += bytes([r, g, b])
        raw_rows.append(row)

    idat = pack_chunk(b'IDAT', zlib.compress(b''.join(raw_rows)))
    iend = pack_chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

def icon_pixels(x, y, w, h):
    # Fondo naranja Amazon
    cx, cy = w / 2, h / 2
    dist = ((x - cx)**2 + (y - cy)**2) ** 0.5
    radius = w / 2 - 1

    if dist > radius:
        return (240, 242, 245)  # Transparente / gris claro

    # Circulo naranja
    bg = (255, 107, 0)

    # Triangulo de play (blanco)
    # Centrado en el circulo
    px = x - cx
    py = y - cy
    # Play: triangulo apuntando a la derecha
    play_left = -w * 0.18
    play_right = w * 0.20
    play_top = -h * 0.22
    play_bottom = h * 0.22

    # Condicion del triangulo
    if px >= play_left and px <= play_right:
        slope = (play_bottom - play_top) / (play_right - play_left) if (play_right - play_left) != 0 else 9999
        top_bound = play_top + slope * (px - play_left)
        bot_bound = play_bottom - slope * (px - play_left)
        if py >= top_bound and py <= bot_bound:
            return (255, 255, 255)

    return bg

png_data = create_png(128, 128, icon_pixels)
with open('icons/icon128.png', 'wb') as f:
    f.write(png_data)

print("Icono generado: icons/icon128.png")
