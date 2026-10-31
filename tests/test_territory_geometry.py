"""Pruebas locales de geometría y transformación (sin red ni Supabase)."""
import importlib.util
import pathlib
import sys
import types
import unittest

# La prueba de funciones puras no necesita instalar libosmium.
if 'osmium' not in sys.modules:
    osmium = types.ModuleType('osmium')
    osmium.SimpleHandler = object
    osmium.geom = types.SimpleNamespace(GeoJSONFactory=object)
    sys.modules['osmium'] = osmium
if 'requests' not in sys.modules:
    sys.modules['requests'] = types.ModuleType('requests')

source = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'territory' / 'refresh_province.py'
spec = importlib.util.spec_from_file_location('territory', source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TestTerritory(unittest.TestCase):
    def test_poligono_con_hueco(self):
        geometry = {'type': 'Polygon', 'coordinates': [
            [[0,0],[10,0],[10,10],[0,10],[0,0]],
            [[4,4],[6,4],[6,6],[4,6],[4,4]],
        ]}
        rings = module.prepare_geometry(geometry)
        self.assertTrue(module.in_region(2,2,rings))
        self.assertFalse(module.in_region(5,5,rings))
        self.assertFalse(module.in_region(20,20,rings))

    def test_diacriticos_y_etiquetas(self):
        self.assertEqual(module.normalize('Clínico Quirúrgico 10 de Octubre'),
                         'clinico quirurgico 10 de octubre')
        row = module.build_record('node',123,
            {'name':'Hospital Clínico','amenity':'hospital','addr:street':'Calzada'}, 23.1,-82.3)
        self.assertEqual(row['source_id'],'osm:node:123')
        self.assertEqual(row['category'],'hospital')
        self.assertEqual(row['search_terms'],'hospital clinico hospital calzada hospital')

    def test_se_ignora_un_lugar_sin_nombre(self):
        self.assertFalse(module.candidate({'amenity':'hospital'}))
        self.assertIsNone(module.build_record('way',42,{'name':'x','amenity':'cafe'},23.0,-82.0))

if __name__=='__main__':unittest.main()
