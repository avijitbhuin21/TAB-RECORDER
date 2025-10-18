from PIL import Image, ImageDraw
import math

def create_icon_png(size, filename):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    gradient_colors = [
        (102, 126, 234),
        (118, 75, 162)
    ]
    
    for y in range(size):
        ratio = y / size
        r = int(gradient_colors[0][0] + (gradient_colors[1][0] - gradient_colors[0][0]) * ratio)
        g = int(gradient_colors[0][1] + (gradient_colors[1][1] - gradient_colors[0][1]) * ratio)
        b = int(gradient_colors[0][2] + (gradient_colors[1][2] - gradient_colors[0][2]) * ratio)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))
    
    center_x = size / 2
    center_y = size / 2
    circle_radius = size * 0.35
    
    draw.ellipse(
        [center_x - circle_radius, center_y - circle_radius,
         center_x + circle_radius, center_y + circle_radius],
        fill='white'
    )
    
    inner_radius = circle_radius * 0.4
    draw.ellipse(
        [center_x - inner_radius, center_y - inner_radius,
         center_x + inner_radius, center_y + inner_radius],
        fill=(239, 68, 68, 255)
    )
    
    triangle_size = size * 0.15
    triangle = [
        (center_x - triangle_size * 0.3, center_y - triangle_size * 0.5),
        (center_x - triangle_size * 0.3, center_y + triangle_size * 0.5),
        (center_x + triangle_size * 0.6, center_y)
    ]
    draw.polygon(triangle, fill='white')
    
    img.save(filename, 'PNG')
    print(f'Created {filename}')

create_icon_png(16, 'icon16.png')
create_icon_png(48, 'icon48.png')
create_icon_png(128, 'icon128.png')

print('\nPNG icons created successfully!')