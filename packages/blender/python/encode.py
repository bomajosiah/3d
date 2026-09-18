"""Encodes an already-rendered frame sequence into a video with Blender's FFmpeg.

Blender ships FFmpeg as a library rather than a binary, so the video sequencer is
the encoder. Frames arrive as PNGs so this never re-renders and never needs to
agree with the renderer about lighting.
"""
import bpy
import json
import os
import sys
import glob

request = json.load(open(sys.argv[sys.argv.index('--') + 1]))
frames = request['frames']
scene = bpy.context.scene
scene.sequence_editor_create()
editor = scene.sequence_editor
# Blender 4.4 renamed SequenceEditor.sequences to .strips; support both.
collection = getattr(editor, 'strips', None) or editor.sequences
strip = collection.new_image(name='frames', filepath=frames[0], channel=1, frame_start=1)
for path in frames[1:]: strip.elements.append(os.path.basename(path))

scene.frame_start, scene.frame_end = 1, len(frames)
scene.render.fps, scene.render.fps_base = request['fps'], 1
scene.render.resolution_x, scene.render.resolution_y = request['width'], request['height']
scene.render.resolution_percentage = 100
# The frames arrive already tone-mapped by the renderer. Blender's default view
# transform (AgX) would grade them a second time, darkening and desaturating the
# video relative to the stills, so read and write them straight through.
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
scene.sequencer_colorspace_settings.name = 'sRGB'
scene.render.image_settings.file_format = 'FFMPEG'
scene.render.image_settings.color_mode = 'RGB'  # video carries no alpha
ffmpeg = scene.render.ffmpeg
if request['format'] == 'webm':
    ffmpeg.format, ffmpeg.codec = 'WEBM', 'WEBM'
else:
    ffmpeg.format, ffmpeg.codec = 'MPEG4', 'H264'
ffmpeg.constant_rate_factor = request['crf']
ffmpeg.ffmpeg_preset = 'GOOD'
ffmpeg.gopsize = max(1, request['fps'] // 2)
ffmpeg.audio_codec = 'NONE'

# Blender decorates video filepaths with the frame range, so render into an empty
# directory and take whatever single file comes out.
staging = request['staging']
scene.render.filepath = os.path.join(staging, 'out')
bpy.ops.render.render(animation=True)
produced = [p for p in glob.glob(os.path.join(staging, '*')) if os.path.isfile(p)]
if len(produced) != 1: raise SystemExit(f'expected one encoded file, got {produced}')
os.replace(produced[0], request['output'])
print(json.dumps({'ok': True, 'output': request['output'], 'frames': len(frames)}))
