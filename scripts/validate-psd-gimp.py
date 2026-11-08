import gi, json
from gi.repository import Gimp, Gio
image=Gimp.file_load(Gimp.RunMode.NONINTERACTIVE,Gio.File.new_for_path('/tmp/mini-paint-compat.psd'))
layers=image.get_layers()
print('GIMP_PSD_LAYERS',json.dumps([{'name':l.get_name(),'visible':l.get_visible(),'opacity':l.get_opacity()} for l in layers],ensure_ascii=False))
print('GIMP_PSD_SIZE',image.get_width(),image.get_height())
proc=Gimp.get_pdb().lookup_procedure('file-png-export')
config=proc.create_config()
config.set_property('run-mode',Gimp.RunMode.NONINTERACTIVE)
config.set_property('image',image)
config.set_property('file',Gio.File.new_for_path('/tmp/mini-paint-gimp.png'))
print('GIMP_EXPORT_RESULT',proc.run(config).index(0))
