#!/usr/bin/env python3
"""Validate or extract the handoff as data. Python 3.10+; standard library only.

No embedded command, TypeScript, package, recipe or test is executed. This checks
packaging and structural traceability, not whether an implementation is correct.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import sys
import xml.etree.ElementTree as ET
import xml.parsers.expat as expat
import zipfile

XML_PART='customXml/checkmate-stratum-handoff.xml'
XML_NS='urn:checkmate-stratum:implementation-handoff:1'
DOCNAME='Checkmate and Stratum Joint Implementation Specification.docx'
PAYLOADS={'implementation-contract.json','implementation-contract.schema.json',
          'decision-extension.contract.ts','validate_handoff.py',
          'CLAUDE_CODE_HANDOFF.md','specification.md'}
SUPPORT={'$schema','$id','$defs','$ref','title','description','type','const','enum',
         'required','properties','additionalProperties','items','minItems','maxItems',
         'uniqueItems','minLength','pattern','minimum','maximum'}

class InvalidHandoff(ValueError): pass
def ensure(ok,message):
    if not ok: raise InvalidHandoff(message)
def sha(data):return hashlib.sha256(data).hexdigest()
def canon(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
def pairs(items):
    result={}
    for k,v in items:
        ensure(k not in result,'Duplicate JSON key '+k);result[k]=v
    return result
def read_json(path):
    def bad(value):raise InvalidHandoff('Nonfinite JSON number '+value)
    return json.loads(path.read_text(encoding='utf-8'),object_pairs_hook=pairs,parse_constant=bad)

def supported_schema(schema,path='$'):
    ensure(isinstance(schema,dict),f'{path}: schema must be an object')
    ensure(not set(schema)-SUPPORT,f'{path}: unsupported schema keywords {sorted(set(schema)-SUPPORT)}')
    for key in ('$defs','properties'):
        for name,child in schema.get(key,{}).items():supported_schema(child,path+'.'+key+'.'+name)
    if 'items' in schema:supported_schema(schema['items'],path+'.items')
    if isinstance(schema.get('additionalProperties'),dict):supported_schema(schema['additionalProperties'],path+'.additionalProperties')

def schema_check(value,schema,root,path='$'):
    if '$ref' in schema:
        ref=schema['$ref'];ensure(ref.startswith('#/$defs/'),'Only local $defs references supported')
        name=ref.split('/')[-1];ensure(name in root.get('$defs',{}),'Missing schema reference '+ref)
        return schema_check(value,root['$defs'][name],root,path)
    if 'const' in schema:ensure(type(value) is type(schema['const']) and value==schema['const'],path+': const mismatch')
    if 'enum' in schema:ensure(any(type(value) is type(x) and value==x for x in schema['enum']),path+': enum mismatch')
    typ=schema.get('type')
    types=typ if isinstance(typ,list) else [typ] if typ else []
    matches={'object':lambda:isinstance(value,dict),'array':lambda:isinstance(value,list),
             'string':lambda:isinstance(value,str),'integer':lambda:type(value) is int,
             'number':lambda:type(value) in (int,float) and math.isfinite(value),
             'boolean':lambda:type(value) is bool,'null':lambda:value is None}
    ensure(not types or any(t in matches and matches[t]() for t in types),path+': type mismatch')
    if isinstance(value,dict):
        props=schema.get('properties',{})
        ensure(set(schema.get('required',[]))<=set(value),path+': missing required fields')
        for k,v in value.items():
            if k in props:schema_check(v,props[k],root,path+'.'+k)
            elif schema.get('additionalProperties') is False:raise InvalidHandoff(path+': unknown field '+k)
            elif isinstance(schema.get('additionalProperties'),dict):schema_check(v,schema['additionalProperties'],root,path+'.'+k)
    if isinstance(value,list):
        ensure(len(value)>=schema.get('minItems',0),path+': too few items')
        ensure(len(value)<=schema.get('maxItems',len(value)),path+': too many items')
        if schema.get('uniqueItems'):ensure(len({canon(v) for v in value})==len(value),path+': duplicate item')
        for i,v in enumerate(value):
            if 'items' in schema:schema_check(v,schema['items'],root,path+f'[{i}]')
    if isinstance(value,str):
        ensure(len(value)>=schema.get('minLength',0),path+': string too short')
        if 'pattern' in schema:ensure(re.search(schema['pattern'],value) is not None,path+': pattern mismatch')
    if type(value) in (int,float):
        ensure(math.isfinite(value),path+': nonfinite number')
        if 'minimum' in schema:ensure(value>=schema['minimum'],path+': below minimum')
        if 'maximum' in schema:ensure(value<=schema['maximum'],path+': above maximum')

def index(records,label):
    result={r['id']:r for r in records}
    ensure(len(result)==len(records),label+': duplicate ID');return result
def check_refs(values,known,label):
    ensure(len(values)==len(set(values)),label+': duplicate reference')
    ensure(set(values)<=set(known),label+': dangling references '+str(sorted(set(values)-set(known))))

def validate_semantics(c):
    units=index(c['source_units'],'source units');reqs=index(c['requirements'],'requirements')
    tasks=index(c['work_packages'],'work packages');tests=index(c['acceptance_tests'],'tests')
    milestones=index(c['milestones'],'milestones');repos=index(c['repositories'],'repositories')
    ensure(set(tests)=={f'A{i:02d}' for i in range(1,29)},'Acceptance catalog must contain A01 through A28')
    ensure(set(tasks)=={f'WP{i:02d}' for i in range(24)},'Work graph must contain WP00 through WP23')
    ensure(c['source_document']['covered_sections']==list(range(1,14)),'Covered sections must be 1 through 13')
    ensure(c['source_document']['source_units_sha256']==sha(canon(c['source_units'])),'Source unit inventory digest mismatch')
    for u in units.values():ensure(u['sha256']==sha(u['text'].encode()),'Source text hash mismatch '+u['id'])
    covered=set()
    for r in reqs.values():
        check_refs(r['owners'],repos,r['id']+' owner');check_refs(r['source_units'],units,r['id']+' source')
        check_refs(r['work_packages'],tasks,r['id']+' work');check_refs(r['acceptance_tests'],tests,r['id']+' tests')
        ensure(r['owners'] and r['source_units'] and r['work_packages'] and r['acceptance_tests'],r['id']+': incomplete implementation linkage')
        covered.update(r['source_units'])
        for tid in r['work_packages']:ensure(r['id'] in tasks[tid]['requirements'],r['id']+': asymmetric work reference')
        task_tests={a for tid in r['work_packages'] for a in tasks[tid]['acceptance_tests']}
        ensure(set(r['acceptance_tests'])<=task_tests,r['id']+': acceptance case has no owning work package')
    normative={u['id'] for u in units.values() if u['classification']=='normative'}
    ensure(normative<=covered,'Uncovered normative source units '+str(sorted(normative-covered)))
    coverage=c['coverage']
    ensure(coverage['normative_units']==len(normative),'Normative count mismatch')
    ensure(coverage['normative_units_linked']==len(normative&covered),'Linked count mismatch')
    ensure(not coverage['uncovered_normative_units'],'Uncovered units recorded')
    ensure(coverage['requirements_with_work']==len(reqs) and coverage['requirements_with_tests']==len(reqs),'Requirement coverage count mismatch')
    for t in tasks.values():
        check_refs(t['depends_on'],tasks,t['id']+' dependencies');check_refs(t['requirements'],reqs,t['id']+' requirements')
        check_refs(t['repositories'],repos,t['id']+' repositories');check_refs(t['acceptance_tests'],tests,t['id']+' tests')
        ensure(t['milestone'] in milestones,t['id']+': missing milestone')
        ensure(t['id'] in milestones[t['milestone']]['work_packages'],t['id']+': asymmetric milestone')
        ensure(t['status']=='not_started' and not t['receipts'],t['id']+': immutable spec must not claim execution')
        for rid in t['requirements']:ensure(t['id'] in reqs[rid]['work_packages'],t['id']+': asymmetric requirement reference')
        for target in t['targets']:
            ensure(target['repository'] in repos,t['id']+': unknown target repository')
            p=Path(target['path']);ensure(not p.is_absolute() and '..' not in p.parts,t['id']+': unsafe repository path')
        for dep in t['depends_on']:ensure(tasks[dep]['milestone']<=t['milestone'],t['id']+': depends on a later milestone')
    order=[];visiting=set();visited=set()
    def visit(tid):
        ensure(tid not in visiting,'Work graph cycle at '+tid)
        if tid in visited:return
        visiting.add(tid)
        for dep in tasks[tid]['depends_on']:visit(dep)
        visiting.remove(tid);visited.add(tid);order.append(tid)
    for tid in tasks:visit(tid)
    for m in milestones.values():
        check_refs(m['work_packages'],tasks,m['id']+' work');check_refs(m['joint_acceptance_tests'],tests,m['id']+' tests')
        ensure(m['work_packages'],m['id']+': empty milestone')
        for tid in m['work_packages']:ensure(tasks[tid]['milestone']==m['id'],m['id']+': wrong work membership')
    for a in tests.values():
        ensure(a['status']=='planned_not_run' and not a['receipts'],a['id']+': planned scenario is not a pass')
        ensure(any(a['id'] in t['acceptance_tests'] for t in tasks.values()),a['id']+': no task owner')
    for ct in c['contracts']:check_refs(ct['acceptance_tests'],tests,ct['id']+' tests')
    ensure(c['authorization']['current_scope']=='artifact_preparation_only','This artifact cannot grant implementation permission')
    ensure(c['decision_extension']['package']=='@stratum/decisions','Missing shared package')
    ensure(c['protocol']['proposed_event_schema']==3 and c['protocol']['currently_implemented_event_schemas']==[1,2],'Version status conflated')
    return {'source_units':len(units),'normative_units':len(normative),'requirements':len(reqs),'work_packages':len(tasks),'acceptance_tests':len(tests),'topological_order':order}

def embedded_files(docx):
    with zipfile.ZipFile(docx) as z:
        ensure(z.namelist().count(XML_PART)==1,'Missing or duplicate custom XML handoff part')
        item=z.getinfo(XML_PART);ensure(item.file_size<=20_000_000,'Embedded payload too large')
        xml=z.read(XML_PART)
        guard=expat.ParserCreate()
        def reject_declaration(*args):raise InvalidHandoff('XML DTD/entity is not allowed')
        guard.StartDoctypeDeclHandler=reject_declaration
        guard.EntityDeclHandler=reject_declaration
        guard.Parse(xml,True)
        root=ET.fromstring(xml);ensure(root.tag=='{'+XML_NS+'}handoff','Wrong handoff namespace')
        files={}
        for child in root:
            ensure(child.tag=='{'+XML_NS+'}file','Unknown embedded element')
            name=child.get('name');ensure(name in PAYLOADS and name not in files,'Unsafe, unknown or duplicate embedded filename')
            ensure(child.get('encoding')=='utf-8','Unsupported embedded encoding')
            data=(child.text or '').encode();ensure(child.get('sha256')==sha(data),'Embedded hash mismatch '+name);files[name]=data
        ensure(set(files)==PAYLOADS,'Missing embedded companion')
        ensure(root.get('contract_sha256')==sha(files['implementation-contract.json']),'Embedded contract root digest mismatch')
        document=z.read('word/document.xml')
    return files,document

def check_document_sources(document,c):
    root=ET.fromstring(document);ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    def norm(s):return ' '.join(s.split())
    paragraphs={norm(''.join(t.text or '' for t in p.findall('.//w:t',ns))) for p in root.findall('.//w:p',ns)}
    rows=set()
    for row in root.findall('.//w:tr',ns):
        cells=[''.join(t.text or '' for t in cell.findall('.//w:t',ns)) for cell in row.findall('w:tc',ns)]
        rows.add(norm(' | '.join(cells)))
    for u in c['source_units']:
        if u['kind']=='figure':continue
        expected=rows if u['kind'] in ('table_row','table_header') else paragraphs
        ensure(norm(u['text']) in expected,'DOCX source unit does not match '+u['id'])
    ensure(any(p.startswith('13 Shared decision extension') for p in paragraphs),'Missing visible shared extension section')
    ensure(any(p.startswith('14 Machine readable implementation handoff') for p in paragraphs),'Missing visible handoff appendix')

def validate_bundle(bundle,docx=None):
    c=read_json(bundle/'implementation-contract.json');s=read_json(bundle/'implementation-contract.schema.json')
    supported_schema(s);schema_check(c,s,s)
    counts=validate_semantics(c)
    manifest=read_json(bundle/'manifest.json');seen=set()
    for f in manifest['files']:
        name=f['path'];ensure(Path(name).name==name and name not in seen,'Unsafe or duplicate manifest filename');seen.add(name)
        file=bundle/name;ensure(file.is_file(),'Missing bundle file '+name)
        data=file.read_bytes();ensure(len(data)==f['bytes'] and sha(data)==f['sha256'],'Manifest mismatch '+name)
    ensure(PAYLOADS<=seen and manifest['document'] in seen,'Manifest lacks required files')
    ensure(manifest['contract_sha256']==sha((bundle/'implementation-contract.json').read_bytes()),'Manifest contract digest mismatch')
    docx=Path(docx) if docx else bundle/manifest['document']
    files,document=embedded_files(docx)
    for name,data in files.items():ensure((bundle/name).read_bytes()==data,'Embedded/companion mismatch '+name)
    ensure(sha(docx.read_bytes())==next(f['sha256'] for f in manifest['files'] if f['path']==manifest['document']),'Selected DOCX differs from manifest')
    check_document_sources(document,c)
    return {'result':'pass','scope':'packaging_schema_traceability_and_integrity_only','application_acceptance_status':'planned_not_run',**counts,'docx_sha256':sha(docx.read_bytes()),'contract_sha256':sha((bundle/'implementation-contract.json').read_bytes())}

def extract_document(docx,destination):
    ensure(not destination.exists(),'Extraction destination must not already exist')
    files,_=embedded_files(docx)
    destination.mkdir(parents=True)
    try:
        for name,data in files.items():(destination/name).write_bytes(data)
        shutil.copy2(docx,destination/DOCNAME)
        manifest={'format':'checkmate-stratum.bundle-manifest.v1','document':DOCNAME,'embedded_part':XML_PART,'contract_sha256':sha(files['implementation-contract.json']),'files':[{'path':p.name,'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(destination.iterdir())], 'manifest_exclusion':'Extraction manifest excludes itself; hashes are integrity checks, not signatures.'}
        (destination/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
        return validate_bundle(destination)
    except Exception:
        # Preserve partial data for inspection; do not delete a directory on error.
        raise

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle',type=Path,default=Path(__file__).resolve().parent)
    parser.add_argument('--docx',type=Path)
    parser.add_argument('--extract-document',type=Path)
    parser.add_argument('--destination',type=Path)
    parser.add_argument('--report',type=Path)
    args=parser.parse_args()
    try:
        if args.extract_document:
            ensure(args.destination is not None,'--destination is required for extraction')
            result=extract_document(args.extract_document,args.destination)
        else:result=validate_bundle(args.bundle,args.docx)
        data=json.dumps(result,indent=2)+'\n'
        if args.report:
            ensure(not args.report.exists(),'Report path already exists; preserve it or choose a new path')
            args.report.write_text(data)
        print(data,end='')
        return 0
    except (InvalidHandoff,ValueError,KeyError,OSError,zipfile.BadZipFile,ET.ParseError) as error:
        print('INVALID HANDOFF: '+str(error),file=sys.stderr);return 1
if __name__=='__main__':sys.exit(main())
