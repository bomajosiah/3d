"""Held-out example: a curved lamp uses the same helpers, with no cutlery code."""
import math
from modeling import loft, sweep


def build(p):
    radius=float(p.get('shade_radius',.055))
    if radius<=0: raise ValueError('shade_radius must be positive')
    base=loft('base',[[(r*math.cos(i*math.tau/32),y,r*math.sin(i*math.tau/32)) for i in range(32)] for y,r in [(0,.06),(.004,.07),(.012,.07),(.016,.06)]],levels=2)
    stem=sweep('stem',[(0,.014,0),(0,.03,0),(0,.13,0),(.005,.19,0),(.035,.22,0),(.06,.22,0)],[.006]*6,levels=2)
    shade=loft('shade',[[(.06+r*math.cos(i*math.tau/32),y,r*math.sin(i*math.tau/32)) for i in range(32)] for y,r in [(.23,.012),(.227,.014),(.183,radius),(.18,radius),(.18,radius-.003),(.184,radius-.004),(.224,.01)]],levels=2)
    return [base,stem,shade]
