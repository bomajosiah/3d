from modeling import mesh, mirror, solidify, bevel, subdivision

def build(parameters):
    obj = mesh('modifier-probe', [(0,0,0),(.02,0,0),(.02,.04,0),(0,.04,0)], [(0,1,2,3)])
    mirror(obj, 'x', True)
    solidify(obj, .004)
    bevel(obj, .0005, 3)
    subdivision(obj, 1)
    return [obj]
